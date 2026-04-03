/* ============================================
   CLUBE DO NATURAL — Landing Page Controller
   (app.js handles most landing logic)
   ============================================ */

// Category cards click handler
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.dataset.category;
      if (cat) window.location.href = `catalogo.html?cat=${cat}`;
    });
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Animate elements on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'fadeIn 0.5s ease forwards';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.category-card, .benefit-card, .recurrence-feature').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
});
