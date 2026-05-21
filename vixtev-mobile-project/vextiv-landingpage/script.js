document.addEventListener("DOMContentLoaded", () => {
    const preloader = document.getElementById('preloader');
    const preBar = document.querySelector('.pre-bar');

    // Animate the loading bar from 0 → 100% over ~1.8 seconds
    // Use small incremental steps with slight randomness
    // to feel organic, not mechanical:

    let progress = 0;
    const interval = setInterval(() => {
        // Random increment between 2 and 8
        progress += Math.random() * 6 + 2;
        if (progress >= 100) progress = 100;
        if (preBar) preBar.style.width = progress + '%';

        if (progress === 100) {
            clearInterval(interval);
            // Short pause at 100%, then fade out
            setTimeout(() => {
                if (preloader) preloader.classList.add('done');
                document.body.style.overflow = '';
                // Make headline visible so words can be seen
                const headline = document.querySelector('.hero-headline');
                if (headline) headline.classList.add('visible');

                // Assign stagger delays to each word
                const words = document.querySelectorAll('.hero-content .word');
                words.forEach((word, i) => {
                    word.style.setProperty('--delay', (i * 80) + 'ms');
                });

                // Trigger reveal after short pause
                setTimeout(() => {
                    words.forEach(word => word.classList.add('revealed'));
                }, 200);

                // After all words revealed, trigger subheadline and buttons fade-up as before
                const heroDelay = words.length * 80 + 400;
                setTimeout(() => {
                    document.querySelectorAll('.hero-content .hero-subheadline, .hero-content .hero-btns')
                        .forEach((el, i) => {
                            setTimeout(() => el.classList.add('visible'), i * 120);
                        });
                }, heroDelay);
            }, 400);
        }
    }, 55);

    // Safety fallback — force dismiss after 4 seconds
    // in case of slow connections:
    setTimeout(() => {
        if (preloader) preloader.classList.add('done');
        document.body.style.overflow = '';
    }, 4000);

    window.addEventListener('load', () => {
        setTimeout(() => {
            // Let preloader handle hero load animations

        }, 100);
    });

    // 1. Navbar scrolled state
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 2. Mobile Hamburger Menu Toggle
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navOverlay = document.getElementById('navOverlay');
    const navClose = document.getElementById('navClose');
    const body = document.body;
    const overlayLinks = document.querySelectorAll('.nav-overlay-link');

    function toggleMenu() {
        navOverlay.classList.toggle('open');
        body.classList.toggle('nav-open');
    }

    if (hamburgerBtn && navClose) {
        hamburgerBtn.addEventListener('click', toggleMenu);
        navClose.addEventListener('click', toggleMenu);

        // Close menu when a link is clicked
        overlayLinks.forEach(link => {
            link.addEventListener('click', toggleMenu);
        });
    }

    // 3. (Staggered hero entrance is now handled by the preloader logic)

    // 4. Scroll-triggered fade-up animations using IntersectionObserver
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -80px 0px', // Trigger when element is 80px from bottom
        threshold: 0
    };

    const fadeObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // If there's a delay data attribute, apply it
                const delay = entry.target.getAttribute('data-delay');
                if (delay) {
                    setTimeout(() => {
                        entry.target.classList.add('visible');
                    }, parseInt(delay));
                } else {
                    entry.target.classList.add('visible');
                }
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-up').forEach((el) => {
        fadeObserver.observe(el);
    });

    // 5. Back to top
    const backToTopBtn = document.getElementById('backToTop');
    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Contact form submit mock
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Message sent. We will get back to you shortly.');
        });
    }

    // ━━━ UPGRADE 1: CUSTOM CURSOR ━━━
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');

    if (dot && ring) {
        let mouseX = 0, mouseY = 0;
        let ringX = 0, ringY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            dot.style.left = mouseX + 'px';
            dot.style.top = mouseY + 'px';
        });

        function animateRing() {
            ringX += (mouseX - ringX) * 0.12;
            ringY += (mouseY - ringY) * 0.12;
            ring.style.left = ringX + 'px';
            ring.style.top = ringY + 'px';
            requestAnimationFrame(animateRing);
        }
        animateRing();

        const hoverTargets = document.querySelectorAll(
            'a, button, .service-card, .portfolio-card, .nav-links a, input, textarea'
        );
        hoverTargets.forEach(el => {
            el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
            el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
        });

        document.addEventListener('mousedown', () => document.body.classList.add('cursor-click'));
        document.addEventListener('mouseup', () => document.body.classList.remove('cursor-click'));

        document.addEventListener('mouseleave', () => {
            dot.style.opacity = '0';
            ring.style.opacity = '0';
        });
        document.addEventListener('mouseenter', () => {
            dot.style.opacity = '1';
            ring.style.opacity = '1';
        });
    }

    // ━━━ UPGRADE 2: SPOTLIGHT CARD EFFECT ━━━
    const cards = document.querySelectorAll('.service-card, .portfolio-card');
    cards.forEach(card => {
        const spotlight = card.querySelector('.card-spotlight');
        if (!spotlight) return;

        card.addEventListener('mouseenter', () => {
            card.classList.add('spotlight-active');
        });

        card.addEventListener('mouseleave', () => {
            card.classList.remove('spotlight-active');
        });

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            spotlight.style.setProperty('--x', x + '%');
            spotlight.style.setProperty('--y', y + '%');
        });
    });

    // Image loading for portfolio cards
    document.querySelectorAll('.card-img').forEach(img => {
        if (img.complete) {
            img.classList.add('img-loaded');
        } else {
            img.addEventListener('load', () => {
                img.classList.add('img-loaded');
            });
        }
    });
    // Social icons entrance animation
    document.querySelectorAll('.social-btn').forEach((btn, i) => {
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(10px)';
        btn.style.transition = `opacity 0.4s ease ${i * 80}ms, transform 0.4s ease ${i * 80}ms, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease`;
    });

    const socialObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.querySelectorAll('.social-btn').forEach(btn => {
                    btn.style.opacity = '1';
                    btn.style.transform = 'translateY(0)';
                });
                socialObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.social-links').forEach(el => socialObserver.observe(el));
});

// Contact Form Handler
const SHEET_URL = "https://script.google.com/macros/s/AKfycbyu2FveI2T7Xi2cODaqKraetHG30dSfIV7Z5AajQALFB54KjrD3yHlifmehYupRZMyngQ/exec";

const contactForm = document.getElementById('contact-form');
const submitBtn = document.getElementById('form-submit');
const spinner = document.getElementById('form-spinner');
const successMsg = document.getElementById('form-success');
const errorMsg = document.getElementById('form-error');

// Helper: show only one status at a time
function showStatus(el) {
    [spinner, successMsg, errorMsg].forEach(e => {
        e.classList.remove('visible');
    });
    if (el) el.classList.add('visible');
}

// Real-time validation — highlight empty fields
function validateForm() {
    const name = document.getElementById('form-name').value.trim();
    const email = document.getElementById('form-email').value.trim();
    const message = document.getElementById('form-message').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name) {
        document.getElementById('form-name').focus();
        document.getElementById('form-name')
            .style.borderColor = 'rgba(255,107,107,0.5)';
        return false;
    }
    if (!email || !emailRegex.test(email)) {
        document.getElementById('form-email').focus();
        document.getElementById('form-email')
            .style.borderColor = 'rgba(255,107,107,0.5)';
        return false;
    }
    if (!message) {
        document.getElementById('form-message').focus();
        document.getElementById('form-message')
            .style.borderColor = 'rgba(255,107,107,0.5)';
        return false;
    }
    return true;
}

// Reset field border colors on input
['form-name', 'form-email', 'form-message'].forEach(id => {
    document.getElementById(id)
        .addEventListener('input', function () {
            this.style.borderColor = '';
        });
});

// Prevent double submissions
let isSubmitting = false;

contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (!validateForm()) return;

    isSubmitting = true;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    showStatus(spinner);

    const payload = {
        name: document.getElementById('form-name').value.trim(),
        email: document.getElementById('form-email').value.trim(),
        message: document.getElementById('form-message').value.trim()
    };

    try {
        await fetch(SHEET_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // no-cors means we can't read response
        // so we assume success if no error thrown
        showStatus(successMsg);
        contactForm.reset();

        // Re-enable after 5 seconds
        setTimeout(() => {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            showStatus(null);
            isSubmitting = false;
        }, 5000);

    } catch (err) {
        showStatus(errorMsg);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        isSubmitting = false;
    }
});
