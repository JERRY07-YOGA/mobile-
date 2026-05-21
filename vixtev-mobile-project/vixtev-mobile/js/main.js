(function () {
  const STORAGE_KEYS = {
    cart: "vixtev_cart",
    wishlist: "vixtev_wishlist",
    orders: "vixtev_orders",
    theme: "vixtev_theme",
    user: "vixtev_user",
    coupon: "vixtev_coupon"
  };

  const CATEGORY_META = {
    Chargers: {
      description: "Fast wall, car, and wireless charging essentials.",
      image: "assets/images/charger-2.svg"
    },
    Earbuds: {
      description: "ANC, gaming, and everyday wireless audio picks.",
      image: "assets/images/earbuds-1.svg"
    },
    Smartwatches: {
      description: "AMOLED wearables with calling and fitness tracking.",
      image: "assets/images/watch-1.svg"
    },
    "Phone Cases": {
      description: "Clear, matte, rugged, and ring-stand phone covers.",
      image: "assets/images/case-1.svg"
    },
    "Power Banks": {
      description: "Slim portable backup power for work and travel.",
      image: "assets/images/powerbank-1.svg"
    },
    "Bluetooth Speakers": {
      description: "Portable speakers for desk setups and weekend listening.",
      image: "assets/images/speaker-1.svg"
    }
  };

  const COUPONS = {
    SAVE10: {
      label: "10% off up to ₹500",
      apply(subtotal) {
        return Math.min(Math.round(subtotal * 0.1), 500);
      }
    },
    VIXTEV200: {
      label: "Flat ₹200 off above ₹1499",
      apply(subtotal) {
        return subtotal >= 1499 ? 200 : 0;
      }
    },
    FREESHIP: {
      label: "Free delivery",
      apply() {
        return 0;
      },
      freeShipping: true
    }
  };

  const LIVE_NAMES = ["Aakash", "Sneha", "Ritika", "Harish", "Neha", "Arjun", "Pooja", "Karan"];
  const LIVE_CITIES = ["Chennai", "Bengaluru", "Hyderabad", "Coimbatore", "Pune", "Madurai", "Mumbai"];

  const money = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });

  const state = {
    products: [],
    cart: normalizeCart(readStorage(STORAGE_KEYS.cart, [])),
    wishlist: readStorage(STORAGE_KEYS.wishlist, []),
    orders: readStorage(STORAGE_KEYS.orders, []),
    theme: readStorage(STORAGE_KEYS.theme, "light"),
    user: readStorage(STORAGE_KEYS.user, null),
    coupon: readStorage(STORAGE_KEYS.coupon, null),
    shopFilters: {
      q: "",
      category: "All",
      priceRange: "all",
      featuredOnly: false,
      fewLeft: false,
      flashSale: false,
      sort: "featured"
    },
    flashEndsAt: getSessionDeadline("vixtev_flash_deadline", 12),
    dispatchEndsAt: getSessionDeadline("vixtev_dispatch_deadline", 3.2),
    revealObserver: null
  };

  function qs(selector, scope = document) {
    return scope.querySelector(selector);
  }

  function qsa(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function hasSupabaseBackend() {
    return Boolean(window.VixtevSupabase && window.VixtevSupabase.enabled);
  }

  function toBackendProfile(user) {
    return {
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || ""
    };
  }

  function mergeOrders(remoteOrders, localOrders) {
    const merged = [];
    const seen = new Set();

    [...(remoteOrders || []), ...(localOrders || [])].forEach((order) => {
      if (!order || seen.has(order.id)) {
        return;
      }
      seen.add(order.id);
      merged.push(order);
    });

    return merged;
  }

  async function syncSupabaseProfile() {
    if (!hasSupabaseBackend()) {
      return;
    }

    try {
      const profile = await window.VixtevSupabase.getCurrentProfile();
      if (profile && profile.email) {
        state.user = {
          ...state.user,
          ...profile
        };
        writeStorage(STORAGE_KEYS.user, state.user);
      }
    } catch (error) {
      console.warn("Supabase profile sync skipped:", error);
    }
  }

  async function syncSupabaseOrders() {
    if (!hasSupabaseBackend()) {
      return;
    }

    try {
      const remoteOrders = await window.VixtevSupabase.fetchOrders();
      if (remoteOrders.length) {
        state.orders = mergeOrders(remoteOrders, state.orders);
        saveOrders();
      }
    } catch (error) {
      console.warn("Supabase order sync skipped:", error);
    }
  }

  function normalizeCart(input) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item) => item && typeof item.id === "string")
      .map((item) => ({
        id: item.id,
        qty: Math.max(1, Number(item.qty) || 1)
      }));
  }

  function getSessionDeadline(key, hoursAhead) {
    const now = Date.now();
    const cached = Number(sessionStorage.getItem(key));

    if (cached && cached > now) {
      return cached;
    }

    const next = now + hoursAhead * 60 * 60 * 1000;
    sessionStorage.setItem(key, String(next));
    return next;
  }

  function getPage() {
    return document.body.dataset.page || "home";
  }

  function formatMoney(value) {
    return money.format(value || 0);
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/%20/g, " ")
      .replace(/[+_]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function resolveCategoryName(value) {
    if (!value) {
      return "All";
    }

    const normalized = normalizeText(value);
    if (normalized === "all") {
      return "All";
    }

    const match = Object.keys(CATEGORY_META).find((category) => normalizeText(category) === normalized);
    return match || value;
  }

  function getProductById(id) {
    const normalizedId = normalizeText(id);
    return state.products.find((product) =>
      product.id === id ||
      normalizeText(product.id) === normalizedId ||
      normalizeText(product.title) === normalizedId
    );
  }

  function getDiscountPercent(product) {
    if (!product.oldPrice || product.oldPrice <= product.price) {
      return 0;
    }

    return Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100);
  }

  function isLowStock(product) {
    return Number(product.stock) <= 6;
  }

  function getFirstName() {
    if (!state.user || !state.user.name) {
      return "Login";
    }

    return state.user.name.split(" ")[0];
  }

  function isLoggedIn() {
    return Boolean(
      state.user &&
      typeof state.user.name === "string" &&
      typeof state.user.email === "string" &&
      typeof state.user.phone === "string" &&
      state.user.name.trim() &&
      state.user.email.trim() &&
      state.user.phone.trim()
    );
  }

  function createStarsMarkup(rating) {
    let output = "";

    for (let index = 1; index <= 5; index += 1) {
      if (rating >= index) {
        output += '<i class="fa-solid fa-star"></i>';
      } else if (rating >= index - 0.5) {
        output += '<i class="fa-solid fa-star-half-stroke"></i>';
      } else {
        output += '<i class="fa-regular fa-star"></i>';
      }
    }

    return output;
  }

  function navLinkMarkup(page, href, label) {
    const active = getPage() === page ? "is-active" : "";
    return `<a class="${active}" href="${href}">${label}</a>`;
  }

  function productCardMarkup(product) {
    const discount = getDiscountPercent(product);
    const lowStock = isLowStock(product);
    const wished = state.wishlist.includes(product.id) ? "is-active" : "";

    return `
      <article class="product-card reveal">
        <div class="product-media">
          <div class="product-badges">
            ${discount ? `<span class="badge badge--discount">${discount}% OFF</span>` : ""}
            ${lowStock ? '<span class="badge badge--stock">Only few left</span>' : ""}
          </div>
          <div class="product-card__actions">
            <button class="wishlist-button ${wished}" type="button" data-wishlist-toggle="${product.id}" aria-label="Add to wishlist">
              <i class="fa-${wished ? "solid" : "regular"} fa-heart"></i>
            </button>
            <button class="quick-view-button" type="button" data-quick-view="${product.id}" aria-label="Quick view">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <a href="${getProductUrl(product.id)}">
            <img src="${product.image}" alt="${product.title}">
          </a>
        </div>
        <div class="product-content">
          <div class="product-meta">
            <span>${product.brand}</span>
            <span>${product.category}</span>
          </div>
          <a class="product-title" href="${getProductUrl(product.id)}">${product.title}</a>
          <div class="stars">${createStarsMarkup(product.rating)}</div>
          <p class="product-copy">${product.shortDescription}</p>
          <div class="price-row">
            <span class="price-current">${formatMoney(product.price)}</span>
            <span class="price-old">${formatMoney(product.oldPrice)}</span>
          </div>
          <div class="product-footer">
            <button class="btn btn-primary add-cart-button" type="button" data-add-cart="${product.id}">
              <i class="fa-solid fa-cart-plus"></i>
              Add to cart
            </button>
            <span class="mini-badge">${product.rating.toFixed(1)} / 5</span>
          </div>
        </div>
      </article>
    `;
  }

  function skeletonMarkup(count) {
    return Array.from({ length: count }, () => `
      <article class="product-card skeleton-card">
        <div class="skeleton skeleton-media"></div>
        <div class="skeleton-content">
          <div class="skeleton" style="height: 18px;"></div>
          <div class="skeleton" style="height: 18px; width: 70%;"></div>
          <div class="skeleton" style="height: 14px; width: 90%;"></div>
          <div class="skeleton" style="height: 14px; width: 52%;"></div>
          <div class="skeleton" style="height: 42px;"></div>
        </div>
      </article>
    `).join("");
  }

  function getProductUrl(id) {
    return `product.html?id=${encodeURIComponent(id)}`;
  }

  function getCartItemCount() {
    return state.cart.reduce((total, item) => total + item.qty, 0);
  }

  function getCartDetailedItems() {
    return state.cart
      .map((item) => {
        const product = getProductById(item.id);
        return product ? { ...product, qty: item.qty } : null;
      })
      .filter(Boolean);
  }

  function getCartTotals() {
    const items = getCartDetailedItems();
    const subtotal = items.reduce((total, item) => total + item.price * item.qty, 0);
    const activeCoupon = state.coupon && COUPONS[state.coupon.code] ? COUPONS[state.coupon.code] : null;
    const deliveryBase = subtotal === 0 ? 0 : subtotal >= 999 ? 0 : 79;
    let discount = 0;
    let delivery = deliveryBase;

    if (activeCoupon) {
      discount = activeCoupon.apply(subtotal);
      if (activeCoupon.freeShipping) {
        delivery = 0;
      }
    }

    return {
      items,
      subtotal,
      discount,
      delivery,
      total: Math.max(0, subtotal - discount + delivery)
    };
  }

  function saveCart() {
    writeStorage(STORAGE_KEYS.cart, state.cart);
    updateCartCounters();
  }

  function saveWishlist() {
    writeStorage(STORAGE_KEYS.wishlist, state.wishlist);
  }

  function saveOrders() {
    writeStorage(STORAGE_KEYS.orders, state.orders);
  }

  function saveCoupon() {
    writeStorage(STORAGE_KEYS.coupon, state.coupon);
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    writeStorage(STORAGE_KEYS.theme, theme);
    qsa("[data-theme-toggle]").forEach((button) => {
      const icon = theme === "dark" ? "fa-sun" : "fa-moon";
      if (button.hasAttribute("data-theme-label")) {
        button.innerHTML = `<i class="fa-solid ${icon}"></i><span style="margin-left: 8px;">${theme === "dark" ? "Light mode" : "Dark mode"}</span>`;
      } else {
        button.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      }
    });
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  }

  function renderShell() {
    const headerHost = qs("[data-site-header]");
    const footerHost = qs("[data-site-footer]");

    if (headerHost) {
      headerHost.innerHTML = `
        <div class="site-shell-layer">
          <div class="topbar">
            <div class="container">
              <p>Free Delivery Above ₹999</p>
              <span class="topbar-pill">COD Available</span>
            </div>
          </div>
          <div class="site-header-wrap">
            <div class="container">
              <header class="site-header">
                <div class="header-row">
                  <a class="header-brand" href="index.html" aria-label="Vixtev Mobile home">
                    <span class="brand-mark"><img src="assets/icons/logo-mark.svg" alt="Vixtev Mobile"></span>
                    <span class="brand-copy">
                      <strong>Vixtev Mobile</strong>
                      <span>Premium Accessories Store</span>
                    </span>
                  </a>

                  <form class="header-search desktop-only" data-header-search>
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="search" name="q" placeholder="Search chargers, earbuds, power banks...">
                    <button class="search-submit" type="submit"><i class="fa-solid fa-arrow-right"></i></button>
                  </form>

                  <div class="header-actions">
                    <button class="icon-button desktop-only" type="button" data-theme-toggle aria-label="Toggle theme">
                      <i class="fa-solid fa-moon"></i>
                    </button>
                    <button class="icon-button" type="button" data-cart-toggle aria-label="Open cart">
                      <span class="icon-stack">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <span class="cart-badge" data-cart-count>0</span>
                      </span>
                    </button>
                    <a class="btn btn-secondary desktop-only" href="login.html" data-account-label>${getFirstName()}</a>
                    <button class="icon-button mobile-only" type="button" data-menu-toggle aria-label="Open menu">
                      <i class="fa-solid fa-bars-staggered"></i>
                    </button>
                  </div>
                </div>

                <div class="nav-links desktop-only">
                  ${navLinkMarkup("home", "index.html", "Home")}
                  ${navLinkMarkup("shop", "shop.html", "Shop")}
                  ${navLinkMarkup("shop", "shop.html", "Categories")}
                  ${navLinkMarkup("orders", "orders.html", "Orders")}
                  ${navLinkMarkup("about", "about.html", "About")}
                  ${navLinkMarkup("contact", "contact.html", "Contact")}
                  ${navLinkMarkup("faq", "faq.html", "FAQ")}
                </div>

                <form class="header-search mobile-only" data-header-search style="margin: 0 12px 12px;">
                  <i class="fa-solid fa-magnifying-glass"></i>
                  <input type="search" name="q" placeholder="Search products">
                  <button class="search-submit" type="submit"><i class="fa-solid fa-arrow-right"></i></button>
                </form>
              </header>
            </div>
          </div>
        </div>
      `;
    }

    if (footerHost) {
      footerHost.innerHTML = `
        <footer class="site-footer">
          <div class="container">
            <div class="footer-top">
              <div class="footer-about">
                <strong>Vixtev Mobile</strong>
                <p>Premium local-style ecommerce storefront for mobile accessories, chargers, cases, earbuds, speakers, and smart everyday tech.</p>
              </div>
              <form class="newsletter-form" data-newsletter-form>
                <input type="email" name="email" placeholder="Enter your email for offers" required>
                <button type="submit" class="btn btn-primary">Join Newsletter</button>
              </form>
            </div>

            <div class="footer-columns">
              <div class="footer-column">
                <h4>About Us</h4>
                <div class="footer-links">
                  <a href="about.html">Our Story</a>
                  <a href="contact.html">Store Support</a>
                  <a href="faq.html">FAQ</a>
                </div>
              </div>
              <div class="footer-column">
                <h4>Quick Links</h4>
                <div class="footer-links">
                  <a href="index.html">Home</a>
                  <a href="shop.html">Shop</a>
                  <a href="orders.html">Orders</a>
                  <a href="login.html">Login</a>
                </div>
              </div>
              <div class="footer-column">
                <h4>Categories</h4>
                <div class="footer-links">
                  <a href="shop.html?category=Chargers">Chargers</a>
                  <a href="shop.html?category=Earbuds">Earbuds</a>
                  <a href="shop.html?category=Phone%20Cases">Phone Cases</a>
                  <a href="shop.html?category=Power%20Banks">Power Banks</a>
                </div>
              </div>
              <div class="footer-column">
                <h4>Customer Support</h4>
                <ul class="support-list">
                  <li><i class="fa-solid fa-truck-fast"></i><span>Fast local dispatch</span></li>
                  <li><i class="fa-solid fa-wallet"></i><span>Cash on delivery</span></li>
                  <li><i class="fa-solid fa-shield-check"></i><span>Quality checked products</span></li>
                </ul>
              </div>
              <div class="footer-column">
                <h4>Contact Details</h4>
                <div class="footer-links">
                  <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer">WhatsApp</a>
                  <a href="mailto:support@vixtevmobile.com">support@vixtevmobile.com</a>
                  <a href="tel:+919876543210">+91 98765 43210</a>
                </div>
              </div>
            </div>

            <div class="footer-bottom">
              <span>© 2026 Vixtev Mobile. Crafted for a portfolio-ready ecommerce experience.</span>
              <div class="social-links">
                <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
                <a href="#" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
                <a href="#" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
                <a href="#" aria-label="YouTube"><i class="fa-brands fa-youtube"></i></a>
              </div>
            </div>
          </div>
        </footer>
      `;
    }

    ensureGlobalUi();
    applyTheme(state.theme);
    updateCartCounters();
  }

  function ensureGlobalUi() {
    if (!qs("#vixtev-overlay")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="overlay" id="vixtev-overlay" data-overlay-close></div>

        <aside class="mobile-menu" id="mobile-menu">
          <div class="mobile-menu__header">
            <strong>Browse Vixtev</strong>
            <button class="close-button" type="button" data-close-ui aria-label="Close menu"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <nav>
            <a href="index.html">Home</a>
            <a href="shop.html">Shop</a>
            <a href="shop.html">Categories</a>
            <a href="orders.html">Orders</a>
            <a href="login.html">${getFirstName()}</a>
            <a href="about.html">About</a>
            <a href="contact.html">Contact</a>
            <a href="faq.html">FAQ</a>
            <button type="button" data-theme-toggle data-theme-label>Toggle Theme</button>
          </nav>
        </aside>

        <aside class="cart-drawer" id="cart-drawer">
          <div class="cart-drawer__header">
            <strong>Shopping Cart</strong>
            <button class="close-button" type="button" data-close-ui aria-label="Close cart"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="drawer-list" data-cart-drawer-list></div>
          <div class="summary-lines" style="margin-top: 18px;">
            <div class="summary-line"><span>Subtotal</span><strong data-drawer-subtotal>${formatMoney(0)}</strong></div>
            <div class="summary-line"><span>Delivery</span><strong data-drawer-delivery>${formatMoney(0)}</strong></div>
            <div class="summary-line total"><span>Total</span><strong data-drawer-total>${formatMoney(0)}</strong></div>
          </div>
          <div class="product-cta" style="margin-top: 18px;">
            <a class="btn btn-secondary" href="cart.html">View cart</a>
            <a class="btn btn-primary" href="checkout.html">Checkout</a>
          </div>
        </aside>

        <section class="quick-view-modal" id="quick-view-modal">
          <div class="quick-view-head">
            <strong>Quick View</strong>
            <button class="close-button" type="button" data-close-ui aria-label="Close quick view"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div data-quick-view-body></div>
        </section>

        <section class="success-modal" id="success-modal">
          <div class="success-check"><i class="fa-solid fa-check"></i></div>
          <h3 style="color: var(--heading); font-family: Outfit, sans-serif; margin-bottom: 10px;">Order Placed Successfully</h3>
          <p style="color: var(--text-soft);" data-success-copy>Your accessories are confirmed and saved in your local order history.</p>
        </section>

        <div class="toast-stack" data-toast-stack></div>
        <div class="live-order-stack" data-live-order-stack></div>

        <a class="whatsapp-float" href="https://wa.me/919876543210" target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp">
          <span class="whatsapp-tooltip">Need Help?</span>
          <i class="fa-brands fa-whatsapp"></i>
        </a>

        <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
          <ul>
            <li><a class="${getPage() === "home" ? "is-active" : ""}" href="index.html"><i class="fa-solid fa-house"></i><span>Home</span></a></li>
            <li><a class="${getPage() === "shop" ? "is-active" : ""}" href="shop.html"><i class="fa-solid fa-bag-shopping"></i><span>Shop</span></a></li>
            <li><a href="shop.html"><i class="fa-solid fa-layer-group"></i><span>Categories</span></a></li>
            <li><a class="${getPage() === "orders" ? "is-active" : ""}" href="orders.html"><i class="fa-solid fa-box-open"></i><span>Orders</span></a></li>
            <li><button type="button" data-cart-toggle><i class="fa-solid fa-cart-shopping"></i><span>Cart</span></button></li>
          </ul>
        </nav>
      `);
    } else {
      const accountLink = qs("#mobile-menu nav a[href='login.html']");
      if (accountLink) {
        accountLink.textContent = getFirstName();
      }
    }
  }

  function closeUi() {
    qsa(".overlay, .mobile-menu, .cart-drawer, .quick-view-modal, .success-modal").forEach((element) => {
      element.classList.remove("is-open", "is-visible");
    });
    document.body.classList.remove("menu-open", "drawer-open", "modal-open");
  }

  function openUi(type) {
    closeUi();
    const overlay = qs("#vixtev-overlay");

    if (overlay) {
      overlay.classList.add("is-visible");
    }

    if (type === "menu") {
      qs("#mobile-menu")?.classList.add("is-open");
      document.body.classList.add("menu-open");
    }

    if (type === "drawer") {
      qs("#cart-drawer")?.classList.add("is-open");
      document.body.classList.add("drawer-open");
    }

    if (type === "quick") {
      qs("#quick-view-modal")?.classList.add("is-open");
      document.body.classList.add("modal-open");
    }

    if (type === "success") {
      qs("#success-modal")?.classList.add("is-open");
      document.body.classList.add("modal-open");
    }
  }

  function updateCartCounters() {
    const count = getCartItemCount();
    qsa("[data-cart-count]").forEach((badge) => {
      badge.textContent = count;
    });
  }

  function addToCart(productId, qty = 1) {
    const existing = state.cart.find((item) => item.id === productId);

    if (existing) {
      existing.qty += qty;
    } else {
      state.cart.push({ id: productId, qty });
    }

    saveCart();
    renderCartDrawer();
    renderCartPage();
    renderCheckoutSummary();
    showToast("Added to cart");
  }

  function removeCartItem(productId) {
    state.cart = state.cart.filter((item) => item.id !== productId);
    saveCart();
    renderCartDrawer();
    renderCartPage();
    renderCheckoutSummary();
    showToast("Removed from cart", "fa-solid fa-trash");
  }

  function updateCartQty(productId, direction) {
    const item = state.cart.find((entry) => entry.id === productId);

    if (!item) {
      return;
    }

    item.qty += direction;

    if (item.qty <= 0) {
      removeCartItem(productId);
      return;
    }

    saveCart();
    renderCartDrawer();
    renderCartPage();
    renderCheckoutSummary();
  }

  function toggleWishlist(productId) {
    if (state.wishlist.includes(productId)) {
      state.wishlist = state.wishlist.filter((id) => id !== productId);
      showToast("Removed from wishlist", "fa-regular fa-heart");
    } else {
      state.wishlist.push(productId);
      showToast("Saved to wishlist", "fa-solid fa-heart");
    }

    saveWishlist();
    rerenderDynamicCards();
  }

  function renderHomePage() {
    const categoryHost = qs("[data-home-categories]");
    const trendingHost = qs("[data-trending-grid]");
    const flashHost = qs("[data-flash-grid]");

    if (categoryHost) {
      categoryHost.innerHTML = Object.entries(CATEGORY_META).map(([category, meta]) => {
        const count = state.products.filter((product) => product.category === category).length;
        return `
          <a class="category-card reveal" href="shop.html?category=${encodeURIComponent(category)}">
            <span class="eyebrow">${count} products</span>
            <h3>${category}</h3>
            <span>${meta.description}</span>
            <img src="${meta.image}" alt="${category}">
          </a>
        `;
      }).join("");
    }

    if (trendingHost) {
      const products = state.products.filter((product) => product.trending).slice(0, 8);
      trendingHost.innerHTML = products.map(productCardMarkup).join("");
    }

    if (flashHost) {
      const products = state.products.filter((product) => product.flashSale).slice(0, 4);
      flashHost.innerHTML = products.map(productCardMarkup).join("");
    }

    initSwipers();
  }

  function initSwipers() {
    if (typeof Swiper !== "function") {
      return;
    }

    const heroElement = qs(".hero-swiper");
    const reviewElement = qs(".reviews-swiper");

    if (heroElement && !heroElement.swiper) {
      new Swiper(heroElement, {
        loop: true,
        autoplay: { delay: 4500, disableOnInteraction: false },
        pagination: { el: ".hero-pagination", clickable: true }
      });
    }

    if (reviewElement && !reviewElement.swiper) {
      new Swiper(reviewElement, {
        slidesPerView: 1,
        spaceBetween: 16,
        pagination: { el: ".review-pagination", clickable: true },
        breakpoints: {
          821: {
            slidesPerView: 3
          }
        }
      });
    }
  }

  function primeShopFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.shopFilters.q = params.get("q") || "";
    state.shopFilters.category = resolveCategoryName(params.get("category") || "All");
    state.shopFilters.sort = params.get("sort") || "featured";
    state.shopFilters.flashSale = params.get("tag") === "flash";

    const searchInput = qs("#shop-search");
    const form = qs("#shop-filter-form");
    const sortSelect = qs("#shop-sort");

    if (searchInput) {
      searchInput.value = state.shopFilters.q;
    }

    if (form) {
      const categoryInput = qsa('input[name="category"]', form).find((input) => input.value === state.shopFilters.category);
      if (categoryInput) {
        categoryInput.checked = true;
      }
      const flashInput = form.querySelector('input[name="flashSale"]');
      if (flashInput) {
        flashInput.checked = state.shopFilters.flashSale;
      }
    }

    if (sortSelect) {
      sortSelect.value = state.shopFilters.sort;
    }
  }

  function collectShopFilters() {
    const form = qs("#shop-filter-form");
    const searchInput = qs("#shop-search");
    const sortInput = qs("#shop-sort");

    state.shopFilters.q = searchInput ? searchInput.value.trim().toLowerCase() : "";
    state.shopFilters.sort = sortInput ? sortInput.value : "featured";

    if (!form) {
      return state.shopFilters;
    }

    const formData = new FormData(form);
    state.shopFilters.category = formData.get("category") || "All";
    state.shopFilters.priceRange = formData.get("priceRange") || "all";
    state.shopFilters.featuredOnly = formData.get("featuredOnly") === "1";
    state.shopFilters.fewLeft = formData.get("fewLeft") === "1";
    state.shopFilters.flashSale = formData.get("flashSale") === "1";
    return state.shopFilters;
  }

  function getFilteredProducts(filters) {
    let products = [...state.products];
    const resolvedCategory = resolveCategoryName(filters.category);

    if (filters.q) {
      products = products.filter((product) => {
        const haystack = `${product.title} ${product.category} ${product.brand} ${product.shortDescription}`.toLowerCase();
        return haystack.includes(filters.q);
      });
    }

    if (resolvedCategory !== "All") {
      products = products.filter((product) => normalizeText(product.category) === normalizeText(resolvedCategory));
    }

    if (filters.priceRange === "under999") {
      products = products.filter((product) => product.price <= 999);
    }

    if (filters.priceRange === "1000-1999") {
      products = products.filter((product) => product.price >= 1000 && product.price <= 1999);
    }

    if (filters.priceRange === "2000plus") {
      products = products.filter((product) => product.price >= 2000);
    }

    if (filters.featuredOnly) {
      products = products.filter((product) => product.featured);
    }

    if (filters.fewLeft) {
      products = products.filter((product) => isLowStock(product));
    }

    if (filters.flashSale) {
      products = products.filter((product) => product.flashSale);
    }

    switch (filters.sort) {
      case "priceLow":
        products.sort((a, b) => a.price - b.price);
        break;
      case "priceHigh":
        products.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        products.sort((a, b) => b.rating - a.rating);
        break;
      case "discount":
        products.sort((a, b) => getDiscountPercent(b) - getDiscountPercent(a));
        break;
      default:
        products.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.trending) - Number(a.trending));
    }

    return products;
  }

  function filterShopProducts() {
    const filters = collectShopFilters();
    return getFilteredProducts(filters);
  }

  function resetConflictingShopFilters(changedInput) {
    const form = qs("#shop-filter-form");
    if (!form || !changedInput) {
      return;
    }

    const allCategory = qs('input[name="category"][value="All"]', form);
    const allPrice = qs('input[name="priceRange"][value="all"]', form);
    const extraInputs = qsa('input[name="featuredOnly"], input[name="fewLeft"], input[name="flashSale"]', form);

    if (changedInput.name === "category") {
      if (allPrice) {
        allPrice.checked = true;
      }
      extraInputs.forEach((input) => {
        input.checked = false;
      });
      return;
    }

    if (changedInput.name === "priceRange") {
      if (allCategory) {
        allCategory.checked = true;
      }
      extraInputs.forEach((input) => {
        input.checked = false;
      });
      return;
    }

    if (changedInput.name === "featuredOnly" || changedInput.name === "fewLeft" || changedInput.name === "flashSale") {
      if (allCategory) {
        allCategory.checked = true;
      }
      if (allPrice) {
        allPrice.checked = true;
      }
      extraInputs.forEach((input) => {
        if (input !== changedInput) {
          input.checked = false;
        }
      });
    }
  }

  function renderShopPage() {
    const grid = qs("[data-shop-grid]");
    if (!grid) {
      return;
    }

    if (!grid.dataset.primed) {
      primeShopFromUrl();
      grid.dataset.primed = "true";
    }
    const products = filterShopProducts();
    const count = qs("[data-results-count]");
    const activeFilters = qs("[data-active-filters]");

    if (count) {
      count.textContent = String(products.length);
    }

    if (activeFilters) {
      const pills = [];
      if (state.shopFilters.q) pills.push(`Search: ${state.shopFilters.q}`);
      if (resolveCategoryName(state.shopFilters.category) !== "All") pills.push(resolveCategoryName(state.shopFilters.category));
      if (state.shopFilters.featuredOnly) pills.push("Featured");
      if (state.shopFilters.fewLeft) pills.push("Few Left");
      if (state.shopFilters.flashSale) pills.push("Flash Sale");
      activeFilters.innerHTML = pills.map((pill) => `<span>${pill}</span>`).join("");
    }

    if (!products.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem;"></i>
          <h3 style="color: var(--heading); font-family: Outfit, sans-serif;">No products found</h3>
          <p>Try a broader search or clear some filters to see more accessories.</p>
        </div>
      `;
    } else {
      grid.innerHTML = products.map(productCardMarkup).join("");
    }

    syncShopUrl();
    observeRevealables();
  }

  function syncShopUrl() {
    if (getPage() !== "shop") {
      return;
    }

    const params = new URLSearchParams();

    if (state.shopFilters.q) params.set("q", state.shopFilters.q);
    if (resolveCategoryName(state.shopFilters.category) !== "All") params.set("category", resolveCategoryName(state.shopFilters.category));
    if (state.shopFilters.sort !== "featured") params.set("sort", state.shopFilters.sort);
    if (state.shopFilters.flashSale) params.set("tag", "flash");

    const next = params.toString() ? `?${params.toString()}` : window.location.pathname.split("/").pop();
    history.replaceState({}, "", next);
  }

  function renderProductPage() {
    const host = qs("[data-product-view]");

    if (!host) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const fallbackId = state.products[0] ? state.products[0].id : "";
    const productId = params.get("id") || fallbackId;
    const product = getProductById(productId);

    if (!product) {
      host.innerHTML = '<div class="empty-state"><p>Product not found.</p></div>';
      return;
    }

    const gallery = Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.image];
    const discount = getDiscountPercent(product);

    document.title = `${product.title} | Vixtev Mobile`;
    const breadcrumb = qs("[data-product-breadcrumb]");
    if (breadcrumb) {
      breadcrumb.textContent = product.title;
    }

    host.innerHTML = `
      <div class="product-detail">
        <div class="product-gallery reveal">
          <div class="gallery-main" data-zoom-box>
            <img src="${gallery[0]}" alt="${product.title}" data-main-image>
          </div>
          <div class="gallery-thumbs">
            ${gallery.map((image, index) => `
              <button class="thumb-button ${index === 0 ? "is-active" : ""}" type="button" data-thumb-src="${image}">
                <img src="${image}" alt="${product.title} thumbnail ${index + 1}">
              </button>
            `).join("")}
          </div>
        </div>

        <div class="product-summary reveal">
          <span class="eyebrow">${product.category}</span>
          <h1>${product.title}</h1>
          <div class="product-meta" style="margin: 14px 0 10px;">
            <span>${product.brand}</span>
            <span>${product.reviews} reviews</span>
          </div>
          <div class="stars">${createStarsMarkup(product.rating)}</div>
          <div class="price-row" style="margin-top: 16px;">
            <span class="price-current">${formatMoney(product.price)}</span>
            <span class="price-old">${formatMoney(product.oldPrice)}</span>
            ${discount ? `<span class="mini-badge">${discount}% OFF</span>` : ""}
          </div>
          <p class="product-lead">${product.description}</p>
          <div class="stock-pill">${isLowStock(product) ? "Only few pieces left in stock" : `${product.stock} units ready to ship`}</div>
          <div class="delivery-chip">Order within <strong data-delivery-clock style="margin-left: 6px;">02h 45m</strong> for same-day dispatch</div>

          <div class="product-cta">
            <button class="btn btn-primary" type="button" data-add-cart="${product.id}">
              <i class="fa-solid fa-cart-plus"></i>
              Add to cart
            </button>
            <button class="btn btn-secondary" type="button" data-buy-now="${product.id}">Buy now</button>
            <button class="btn btn-ghost" type="button" data-wishlist-toggle="${product.id}">
              <i class="fa-${state.wishlist.includes(product.id) ? "solid" : "regular"} fa-heart"></i>
            </button>
          </div>

          <div style="margin-top: 26px;">
            <h3 style="color: var(--heading); font-family: Outfit, sans-serif; margin-bottom: 12px;">Key Highlights</h3>
            <ul class="highlight-list">
              ${product.highlights.map((item) => `<li><i class="fa-solid fa-check"></i><span>${item}</span></li>`).join("")}
            </ul>
          </div>

          <div style="margin-top: 26px;">
            <h3 style="color: var(--heading); font-family: Outfit, sans-serif; margin-bottom: 12px;">Specifications</h3>
            <ul class="spec-list">
              ${product.specifications.map((item) => `<li><i class="fa-solid fa-circle-info"></i><span>${item}</span></li>`).join("")}
            </ul>
          </div>
        </div>
      </div>
    `;

    renderStickyProductBar(product);
    renderRelatedProducts(product);
    initProductZoom();
  }

  function initProductZoom() {
    const zoomBox = qs("[data-zoom-box]");
    const image = qs("[data-main-image]");

    if (!zoomBox || !image) {
      return;
    }

    zoomBox.addEventListener("mousemove", (event) => {
      const rect = zoomBox.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      image.style.setProperty("--zoom-x", `${x}%`);
      image.style.setProperty("--zoom-y", `${y}%`);
      image.style.transform = "scale(1.12)";
    });

    zoomBox.addEventListener("mouseleave", () => {
      image.style.transform = "scale(1)";
      image.style.setProperty("--zoom-x", "50%");
      image.style.setProperty("--zoom-y", "50%");
    });
  }

  function renderStickyProductBar(product) {
    qsa(".sticky-product-bar").forEach((node) => node.remove());
    document.body.insertAdjacentHTML("beforeend", `
      <div class="sticky-product-bar">
        <div class="sticky-product-bar__inner">
          <div>
            <strong style="color: var(--heading); display: block;">${product.title}</strong>
            <span style="color: var(--text-soft);">${formatMoney(product.price)}</span>
          </div>
          <button class="btn btn-primary" type="button" data-add-cart="${product.id}">Add to cart</button>
        </div>
      </div>
    `);
  }

  function renderRelatedProducts(product) {
    const host = qs("[data-related-grid]");
    if (!host) {
      return;
    }

    const related = state.products
      .filter((item) => normalizeText(item.category) === normalizeText(product.category) && item.id !== product.id)
      .slice(0, 4);

    host.innerHTML = related.map(productCardMarkup).join("");
  }

  function renderCartDrawer() {
    const list = qs("[data-cart-drawer-list]");
    if (!list) {
      return;
    }

    const totals = getCartTotals();

    if (!totals.items.length) {
      list.innerHTML = `
        <div class="drawer-empty">
          <i class="fa-solid fa-bag-shopping" style="font-size: 2rem;"></i>
          <p>Your cart is empty right now.</p>
        </div>
      `;
    } else {
      list.innerHTML = totals.items.map((item) => `
        <article class="drawer-item">
          <img src="${item.image}" alt="${item.title}">
          <div>
            <h3>${item.title}</h3>
            <small>${formatMoney(item.price)} each</small>
            <div class="quantity-box" style="margin-top: 10px;">
              <button class="quantity-button" type="button" data-qty-change="${item.id}" data-direction="-1"><i class="fa-solid fa-minus"></i></button>
              <span>${item.qty}</span>
              <button class="quantity-button" type="button" data-qty-change="${item.id}" data-direction="1"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <div style="text-align: right;">
            <strong style="color: var(--heading);">${formatMoney(item.price * item.qty)}</strong>
            <button class="text-link" type="button" data-remove-cart="${item.id}" style="display: block; margin-top: 8px;">Remove</button>
          </div>
        </article>
      `).join("");
    }

    const subtotal = qs("[data-drawer-subtotal]");
    const delivery = qs("[data-drawer-delivery]");
    const total = qs("[data-drawer-total]");

    if (subtotal) subtotal.textContent = formatMoney(totals.subtotal);
    if (delivery) delivery.textContent = formatMoney(totals.delivery);
    if (total) total.textContent = formatMoney(totals.total);
  }

  function renderCartPage() {
    const host = qs("[data-cart-page]");
    if (!host) {
      return;
    }

    const totals = getCartTotals();

    if (!totals.items.length) {
      host.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-bag-shopping" style="font-size: 2rem;"></i>
          <h3 style="color: var(--heading); font-family: Outfit, sans-serif;">Your cart is empty</h3>
          <p>Add products from the shop to start building your order.</p>
          <a class="btn btn-primary" href="shop.html">Continue shopping</a>
        </div>
      `;
      return;
    }

    const couponCode = state.coupon && COUPONS[state.coupon.code] ? state.coupon.code : "";

    host.innerHTML = `
      <div class="cart-layout">
        <section class="cart-list reveal">
          <h2>Cart Items</h2>
          ${totals.items.map((item) => `
            <article class="cart-item">
              <img src="${item.image}" alt="${item.title}">
              <div class="cart-product">
                <div>
                  <h3>${item.title}</h3>
                  <small>${item.category} • ${item.brand}</small>
                </div>
                <strong style="color: var(--heading);">${formatMoney(item.price)}</strong>
              </div>
              <div class="mobile-order-row">
                <div class="quantity-box">
                  <button class="quantity-button" type="button" data-qty-change="${item.id}" data-direction="-1"><i class="fa-solid fa-minus"></i></button>
                  <span>${item.qty}</span>
                  <button class="quantity-button" type="button" data-qty-change="${item.id}" data-direction="1"><i class="fa-solid fa-plus"></i></button>
                </div>
                <div style="text-align: right;">
                  <strong style="color: var(--heading);">${formatMoney(item.price * item.qty)}</strong>
                  <button class="text-link" type="button" data-remove-cart="${item.id}" style="display: block; margin-top: 6px;">Remove</button>
                </div>
              </div>
            </article>
          `).join("")}
        </section>

        <aside class="summary-card reveal">
          <h3>Price Summary</h3>
          <div class="coupon-box">
            <input class="input-field" type="text" value="${couponCode}" placeholder="Coupon code" data-coupon-input>
            <button class="btn btn-secondary" type="button" data-apply-coupon>Apply</button>
          </div>
          ${couponCode ? `<div class="summary-tag" style="margin-bottom: 14px;">Coupon active: ${couponCode}</div>` : ""}
          <div class="summary-lines">
            <div class="summary-line"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
            <div class="summary-line"><span>Discount</span><strong>- ${formatMoney(totals.discount)}</strong></div>
            <div class="summary-line"><span>Delivery</span><strong>${formatMoney(totals.delivery)}</strong></div>
            <div class="summary-line total"><span>Total</span><strong>${formatMoney(totals.total)}</strong></div>
          </div>
          <div class="product-cta">
            <a class="btn btn-secondary" href="shop.html">Add more products</a>
            <a class="btn btn-primary" href="checkout.html">Proceed to checkout</a>
          </div>
        </aside>
      </div>
    `;
  }

  function applyCouponFromUi() {
    const input = qs("[data-coupon-input]");
    const code = input ? input.value.trim().toUpperCase() : "";

    if (!code) {
      state.coupon = null;
      saveCoupon();
      renderCartPage();
      renderCheckoutSummary();
      showToast("Coupon cleared", "fa-solid fa-ticket");
      return;
    }

    if (!COUPONS[code]) {
      showToast("Invalid coupon code", "fa-solid fa-circle-exclamation");
      return;
    }

    const subtotal = getCartTotals().subtotal;
    const previewDiscount = COUPONS[code].apply(subtotal);
    if (!COUPONS[code].freeShipping && previewDiscount <= 0) {
      showToast("Coupon not eligible for this cart", "fa-solid fa-circle-exclamation");
      return;
    }

    state.coupon = { code };
    saveCoupon();
    renderCartPage();
    renderCheckoutSummary();
    renderCartDrawer();
    showToast(`Coupon ${code} applied`, "fa-solid fa-ticket");
  }

  function renderCheckoutSummary() {
    const host = qs("[data-checkout-summary]");
    if (!host) {
      return;
    }

    const totals = getCartTotals();

    if (!totals.items.length) {
      host.innerHTML = `
        <div class="summary-card">
          <h3>Your cart is empty</h3>
          <p style="color: var(--text-soft); margin-bottom: 18px;">Add some products before heading to checkout.</p>
          <a class="btn btn-primary" href="shop.html">Go to shop</a>
        </div>
      `;
      return;
    }

    host.classList.add("reveal");
    host.innerHTML = `
      <div class="summary-card">
        <h3>Order Summary</h3>
        ${!isLoggedIn() ? `
          <div class="summary-tag" style="margin-bottom: 16px;">
            <i class="fa-solid fa-lock"></i>
            Login required to place order
          </div>
        ` : ""}
        <div class="order-products">
          ${totals.items.map((item) => `
            <div class="quick-cart-line">
              <img src="${item.image}" alt="${item.title}">
              <div>
                <strong style="color: var(--heading); display: block;">${item.title}</strong>
                <small style="color: var(--text-soft);">Qty ${item.qty}</small>
              </div>
              <strong style="color: var(--heading);">${formatMoney(item.price * item.qty)}</strong>
            </div>
          `).join("")}
        </div>
        <div class="summary-lines" style="margin-top: 18px;">
          <div class="summary-line"><span>Subtotal</span><strong>${formatMoney(totals.subtotal)}</strong></div>
          <div class="summary-line"><span>Discount</span><strong>- ${formatMoney(totals.discount)}</strong></div>
          <div class="summary-line"><span>Delivery</span><strong>${formatMoney(totals.delivery)}</strong></div>
          <div class="summary-line total"><span>Payable</span><strong>${formatMoney(totals.total)}</strong></div>
        </div>
        ${isLoggedIn()
          ? '<button class="btn btn-primary btn-block" style="margin-top: 18px;" type="submit" form="checkout-form">Place Order</button>'
          : '<a class="btn btn-primary btn-block" style="margin-top: 18px;" href="login.html?next=checkout.html">Login to continue</a>'
        }
      </div>
    `;
  }

  function renderOrdersPage() {
    const host = qs("[data-orders-page]");
    if (!host) {
      return;
    }

    if (!state.orders.length) {
      host.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open" style="font-size: 2rem;"></i>
          <h3 style="color: var(--heading); font-family: Outfit, sans-serif;">No orders yet</h3>
          <p>Place an order from checkout and it will appear here instantly.</p>
          <a class="btn btn-primary" href="shop.html">Shop now</a>
        </div>
      `;
      return;
    }

    host.innerHTML = `
      <div class="orders-wrap reveal">
        <h2>Recent Orders</h2>
        ${state.orders.map((order) => `
          <article class="order-card">
            <div class="order-head">
              <div>
                <strong>${order.id}</strong>
                <span style="color: var(--text-soft);">${order.date}</span>
              </div>
              <span class="status-pill ${order.statusClass}">${order.status}</span>
            </div>
            <div class="order-products">
              ${order.items.map((item) => `
                <div class="order-item">
                  <img src="${item.image}" alt="${item.title}">
                  <div>
                    <h3>${item.title}</h3>
                    <small>Qty ${item.qty} • ${formatMoney(item.price)}</small>
                  </div>
                  <strong style="color: var(--heading);">${formatMoney(item.price * item.qty)}</strong>
                </div>
              `).join("")}
            </div>
            <div class="summary-lines" style="margin-top: 16px;">
              <div class="summary-line"><span>Payment</span><strong>${order.paymentMethod}</strong></div>
              <div class="summary-line"><span>Ship to</span><strong>${order.customer.city}, ${order.customer.state}</strong></div>
              <div class="summary-line total"><span>Total</span><strong>${formatMoney(order.total)}</strong></div>
            </div>
          </article>
        `).join("")}
      </div>
    `;
  }

  async function handleCheckoutSubmit(event) {
    event.preventDefault();

    const totals = getCartTotals();
    if (!totals.items.length) {
      showToast("Your cart is empty", "fa-solid fa-circle-exclamation");
      return;
    }

    if (!isLoggedIn()) {
      showToast("Please login before placing your order", "fa-solid fa-lock");
      setTimeout(() => {
        window.location.href = "login.html?next=checkout.html";
      }, 700);
      return;
    }

    const form = event.currentTarget;
    if (!form.reportValidity()) {
      return;
    }

    const formData = new FormData(form);
    const customer = Object.fromEntries(formData.entries());
    const statuses = [
      { label: "Processing", className: "status-pill--processing" },
      { label: "Shipped", className: "status-pill--shipped" },
      { label: "Delivered", className: "status-pill--delivered" }
    ];
    const status = statuses[state.orders.length % statuses.length];

    const order = {
      id: `VX${Date.now().toString().slice(-7)}`,
      date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
      paymentMethod: customer.paymentMethod,
      customer,
      items: totals.items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      delivery: totals.delivery,
      total: totals.total,
      status: status.label,
      statusClass: status.className
    };

    state.orders.unshift(order);
    saveOrders();
    state.user = { name: customer.fullName, email: customer.email, phone: customer.phone };
    writeStorage(STORAGE_KEYS.user, state.user);

    if (hasSupabaseBackend()) {
      try {
        await window.VixtevSupabase.saveProfile(toBackendProfile(state.user));
        await window.VixtevSupabase.saveOrder(order);
        await syncSupabaseOrders();
      } catch (error) {
        console.warn("Supabase order save skipped:", error);
      }
    }

    state.cart = [];
    saveCart();
    state.coupon = null;
    saveCoupon();
    renderCartDrawer();
    renderCheckoutSummary();
    renderOrdersPage();
    renderShell();
    openUi("success");
    animateSuccessModal();
    setTimeout(() => {
      closeUi();
      window.location.href = "orders.html?success=1";
    }, 2200);
  }

  function animateSuccessModal() {
    const modal = qs("#success-modal");
    if (!modal || typeof gsap !== "function") {
      return;
    }

    gsap.fromTo(modal, { scale: 0.92, y: 18 }, { scale: 1, y: 0, duration: 0.35, ease: "power2.out" });
  }

  function populateCheckoutUser() {
    const form = qs("#checkout-form");
    if (!form || !state.user) {
      return;
    }

    ["fullName", "email", "phone"].forEach((name) => {
      const field = form.elements[name];
      if (field && !field.value) {
        field.value = state.user[name === "fullName" ? "name" : name] || "";
      }
    });
  }

  function openQuickView(productId) {
    const product = getProductById(productId);
    const host = qs("[data-quick-view-body]");

    if (!product || !host) {
      return;
    }

    host.innerHTML = `
      <div class="quick-view-body">
        <div class="quick-view-media">
          <img src="${product.image}" alt="${product.title}">
        </div>
        <div>
          <span class="eyebrow">${product.category}</span>
          <h2 style="color: var(--heading); font-family: Outfit, sans-serif; font-size: 2rem;">${product.title}</h2>
          <div class="stars" style="margin: 12px 0;">${createStarsMarkup(product.rating)}</div>
          <p style="color: var(--text-soft); margin-bottom: 16px;">${product.description}</p>
          <div class="price-row">
            <span class="price-current">${formatMoney(product.price)}</span>
            <span class="price-old">${formatMoney(product.oldPrice)}</span>
            <span class="mini-badge">${product.brand}</span>
          </div>
          <ul class="highlight-list" style="margin: 18px 0 24px;">
            ${product.highlights.map((item) => `<li><i class="fa-solid fa-check"></i><span>${item}</span></li>`).join("")}
          </ul>
          <div class="product-cta">
            <button class="btn btn-primary" type="button" data-add-cart="${product.id}">Add to cart</button>
            <a class="btn btn-secondary" href="${getProductUrl(product.id)}">Full details</a>
          </div>
        </div>
      </div>
    `;

    openUi("quick");

    if (typeof gsap === "function") {
      const modal = qs("#quick-view-modal");
      gsap.fromTo(modal, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.28, ease: "power2.out" });
    }
  }

  function renderFaq() {
    if (window.location.search.includes("success=1") && getPage() === "orders") {
      showToast("Order saved to your history");
    }
  }

  function initTimers() {
    updateCountdowns();
    updateDeliveryClocks();
    setInterval(updateCountdowns, 1000);
    setInterval(updateDeliveryClocks, 60000);
  }

  function updateCountdowns() {
    const remaining = Math.max(0, state.flashEndsAt - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    qsa("[data-countdown]").forEach((node) => {
      node.textContent = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    });
  }

  function updateDeliveryClocks() {
    const remaining = Math.max(0, state.dispatchEndsAt - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    qsa("[data-delivery-clock]").forEach((node) => {
      node.textContent = `${pad(hours)}h ${pad(minutes)}m`;
    });
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function showToast(message, icon = "fa-solid fa-circle-check") {
    const stack = qs("[data-toast-stack]");
    if (!stack) {
      return;
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
    stack.appendChild(toast);

    if (typeof gsap === "function") {
      gsap.fromTo(toast, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" });
    }

    setTimeout(() => {
      toast.remove();
    }, 2400);
  }

  function initLiveOrders() {
    const eligiblePages = ["home", "shop", "product"];
    if (!eligiblePages.includes(getPage())) {
      return;
    }

    renderLiveOrder();
    setInterval(renderLiveOrder, 16000);
  }

  function renderLiveOrder() {
    const stack = qs("[data-live-order-stack]");
    if (!stack || !state.products.length) {
      return;
    }

    stack.innerHTML = "";
    const name = LIVE_NAMES[Math.floor(Math.random() * LIVE_NAMES.length)];
    const city = LIVE_CITIES[Math.floor(Math.random() * LIVE_CITIES.length)];
    const product = state.products[Math.floor(Math.random() * state.products.length)];
    const node = document.createElement("div");
    node.className = "live-order";
    node.innerHTML = `<i class="fa-solid fa-bell"></i><span><strong>${name}</strong> from ${city} ordered <strong>${product.title}</strong> just now</span>`;
    stack.appendChild(node);

    setTimeout(() => {
      node.remove();
    }, 5200);
  }

  function initRevealObserver() {
    if (state.revealObserver || !("IntersectionObserver" in window)) {
      return;
    }

    state.revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const element = entry.target;
        if (typeof gsap === "function") {
          gsap.to(element, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" });
        } else {
          element.style.opacity = "1";
          element.style.transform = "translateY(0)";
        }
        state.revealObserver.unobserve(element);
      });
    }, { threshold: 0.12 });
  }

  function observeRevealables() {
    initRevealObserver();
    qsa(".reveal").forEach((node) => {
      state.revealObserver?.observe(node);
    });
  }

  function rerenderDynamicCards() {
    if (qs("[data-trending-grid]")) renderHomePage();
    if (qs("[data-shop-grid]")) renderShopPage();
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("id");
    if (productId && qs("[data-product-view]")) {
      renderProductPage();
    }
    observeRevealables();
  }

  function handleThumbSwap(button) {
    const main = qs("[data-main-image]");
    if (!main) {
      return;
    }

    main.src = button.dataset.thumbSrc || main.src;
    qsa("[data-thumb-src]").forEach((thumb) => thumb.classList.remove("is-active"));
    button.classList.add("is-active");
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-menu-toggle],[data-cart-toggle],[data-close-ui],[data-overlay-close],[data-add-cart],[data-remove-cart],[data-qty-change],[data-theme-toggle],[data-quick-view],[data-wishlist-toggle],[data-thumb-src],[data-buy-now],[data-apply-coupon],[data-clear-filters]");
      if (!target) {
        return;
      }

      if (target.matches("[data-menu-toggle]")) {
        openUi("menu");
      }

      if (target.matches("[data-cart-toggle]")) {
        renderCartDrawer();
        openUi("drawer");
      }

      if (target.matches("[data-close-ui], [data-overlay-close]")) {
        closeUi();
      }

      if (target.matches("[data-add-cart]")) {
        addToCart(target.dataset.addCart, 1);
      }

      if (target.matches("[data-remove-cart]")) {
        removeCartItem(target.dataset.removeCart);
      }

      if (target.matches("[data-qty-change]")) {
        updateCartQty(target.dataset.qtyChange, Number(target.dataset.direction || 0));
      }

      if (target.matches("[data-theme-toggle]")) {
        toggleTheme();
      }

      if (target.matches("[data-quick-view]")) {
        openQuickView(target.dataset.quickView);
      }

      if (target.matches("[data-wishlist-toggle]")) {
        toggleWishlist(target.dataset.wishlistToggle);
      }

      if (target.matches("[data-thumb-src]")) {
        handleThumbSwap(target);
      }

      if (target.matches("[data-buy-now]")) {
        addToCart(target.dataset.buyNow, 1);
        window.location.href = "checkout.html";
      }

      if (target.matches("[data-apply-coupon]")) {
        applyCouponFromUi();
      }

      if (target.matches("[data-clear-filters]")) {
        const form = qs("#shop-filter-form");
        if (form) {
          form.reset();
        }
        const searchInput = qs("#shop-search");
        if (searchInput) {
          searchInput.value = "";
        }
        state.shopFilters = {
          q: "",
          category: "All",
          priceRange: "all",
          featuredOnly: false,
          fewLeft: false,
          flashSale: false,
          sort: "featured"
        };
        const sortInput = qs("#shop-sort");
        if (sortInput) {
          sortInput.value = "featured";
        }
        renderShopPage();
      }
    });

    document.addEventListener("submit", (event) => {
      const form = event.target;

      if (form.matches("[data-header-search]")) {
        event.preventDefault();
        const query = new FormData(form).get("q");
        window.location.href = `shop.html${query ? `?q=${encodeURIComponent(String(query).trim())}` : ""}`;
      }

      if (form.matches("#checkout-form")) {
        void handleCheckoutSubmit(event);
      }

      if (form.matches("#login-form")) {
        event.preventDefault();
        void (async () => {
          const data = Object.fromEntries(new FormData(form).entries());
          state.user = data;
          writeStorage(STORAGE_KEYS.user, data);
          if (hasSupabaseBackend()) {
            try {
              await window.VixtevSupabase.saveProfile(toBackendProfile(data));
              await syncSupabaseProfile();
            } catch (error) {
              console.warn("Supabase profile save skipped:", error);
            }
          }
          renderShell();
          showToast(`Welcome, ${getFirstName()}`);
          const next = new URLSearchParams(window.location.search).get("next") || "index.html";
          setTimeout(() => {
            window.location.href = next;
          }, 800);
        })();
      }

      if (form.matches("#contact-form")) {
        event.preventDefault();
        form.reset();
        showToast("Message sent successfully");
      }

      if (form.matches("[data-newsletter-form]")) {
        event.preventDefault();
        form.reset();
        showToast("You are subscribed");
      }
    });

    document.addEventListener("input", (event) => {
      if (event.target.matches("#shop-search")) {
        renderShopPage();
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target.matches("#shop-filter-form input, #shop-sort")) {
        renderShopPage();
        if (event.target.matches("#shop-filter-form input")) {
          const products = filterShopProducts();
          if (!products.length) {
            resetConflictingShopFilters(event.target);
            renderShopPage();
            showToast("Cleared conflicting filters to show matching products", "fa-solid fa-filter");
          }
        }
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeUi();
      }
    });

    qsa(".faq-question").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".faq-item");
        item?.classList.toggle("is-open");
      });
    });
  }

  function showLoadingSkeletons() {
    const homeTrending = qs("[data-trending-grid]");
    const homeFlash = qs("[data-flash-grid]");
    const shopGrid = qs("[data-shop-grid]");
    const related = qs("[data-related-grid]");

    if (homeTrending) homeTrending.innerHTML = skeletonMarkup(4);
    if (homeFlash) homeFlash.innerHTML = skeletonMarkup(2);
    if (shopGrid) shopGrid.innerHTML = skeletonMarkup(8);
    if (related) related.innerHTML = skeletonMarkup(4);
  }

  async function loadProducts() {
    try {
      const response = await fetch("data/products.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load JSON");
      }
      const products = await response.json();
      return Array.isArray(products) ? products : [];
    } catch (error) {
      return Array.isArray(window.VIXTEV_PRODUCT_FALLBACK) ? window.VIXTEV_PRODUCT_FALLBACK : [];
    }
  }

  function finalizePage() {
    renderHomePage();
    renderShopPage();
    renderProductPage();
    renderCartDrawer();
    renderCartPage();
    renderCheckoutSummary();
    renderOrdersPage();
    populateCheckoutUser();
    renderFaq();
    observeRevealables();
  }

  async function init() {
    await syncSupabaseProfile();
    renderShell();
    showLoadingSkeletons();
    bindEvents();
    initTimers();
    state.products = await loadProducts();
    await syncSupabaseOrders();
    finalizePage();
    initLiveOrders();
  }

  init();
})();
