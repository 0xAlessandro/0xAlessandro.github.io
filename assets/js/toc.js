document.addEventListener('DOMContentLoaded', () => {
  // Safeguard: only activate on pages with a post container and a TOC nav
  const post = document.querySelector('.post');
  const tocNav = document.querySelector("nav#TableOfContents");
  if (!post || !tocNav) return;

  // Headline highlighting (compatible with original theme script)
  let activeElementId = null;
  const observer = new IntersectionObserver((entries) => {
    if (!Array.isArray(entries)) return;
    // reset states when we have an active element
    if (activeElementId) {
      document.querySelectorAll("nav#TableOfContents li").forEach((node) => {
        node.classList.add('inactive');
        node.classList.replace('active', 'inactive');
      });
    }
    entries.forEach((entry) => {
      if (entry.intersectionRatio > 0) {
        activeElementId = entry.target.getAttribute('id');
      }
      if (activeElementId) {
        const link = document.querySelector(`nav#TableOfContents li a[href="#${CSS.escape(activeElementId)}"]`);
        if (link && link.parentElement) {
          link.parentElement.classList.replace('inactive', 'active');
        }
      }
    });
  }, { root: document.querySelector('.container.content') || null });

  post.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]').forEach((section) => observer.observe(section));
});
