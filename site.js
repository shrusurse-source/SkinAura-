const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const account = { session: null };

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function initNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("open", !expanded);
  });
  const logout = document.querySelector("[data-logout]");
  if (logout) logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  });
}

async function initHome(signedIn) {
  const routineFilm = document.querySelector(".routine-film");
  const routineFilmToggle = document.getElementById("routineFilmToggle");
  if (routineFilm && routineFilmToggle) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setPaused = paused => {
      routineFilm.classList.toggle("is-paused", paused);
      routineFilmToggle.setAttribute("aria-pressed", String(paused));
      routineFilmToggle.setAttribute("aria-label", `${paused ? "Play" : "Pause"} product showcase`);
      routineFilmToggle.querySelector(".routine-film-toggle-icon").textContent = paused ? "▶" : "Ⅱ";
      routineFilmToggle.querySelector(".routine-film-toggle-label").textContent = `${paused ? "Play" : "Pause"} showcase`;
    };
    routineFilmToggle.hidden = reducedMotion.matches;
    setPaused(reducedMotion.matches);
    routineFilmToggle.addEventListener("click", () => {
      setPaused(!routineFilm.classList.contains("is-paused"));
    });
  }
  const orders = document.getElementById("homeOrders");
  if (!signedIn && orders) {
    orders.innerHTML = '<p class="side-desc">Sign in with a sample customer account to view its order and get personalized support.</p><a class="text-link" href="/login">Sign in to view your order →</a>';
  }
  const status = document.getElementById("serviceStatus");
  if (status) {
    try {
      const health = await getJson("/api/health");
      status.innerHTML = `<i class="connected"></i> Support ${health.ai_configured ? "AI connected" : "ready in demo mode"}`;
    } catch {
      status.innerHTML = '<i class="disconnected"></i> Support service unavailable';
    }
  }
  if (signedIn) await loadOrders("homeOrders", true);
}

async function initAccount() {
  const response = await fetch("/api/session");
  if (!response.ok) {
    return false;
  }
  const session = await response.json();
  if (!session.signed_in) return false;
  account.session = session;
  document.querySelectorAll("[data-user-name]").forEach(node => {
    node.textContent = session.customer;
    node.classList.remove("hidden");
  });
  document.querySelectorAll("[data-logout]").forEach(node => {
    node.classList.remove("hidden");
  });
  document.getElementById("loginLink")?.classList.add("hidden");
  document.getElementById("accountSlot")?.classList.remove("hidden");
  return true;
}

async function loadCaptcha() {
  const response = await getJson("/api/captcha");
  document.getElementById("captchaId").value = response.captcha_id;
  document.getElementById("captchaImage").src = response.image;
}

async function loadAdminOrders() {
  const orderMessage = document.getElementById("adminOrdersMessage");
  try {
    const { orders } = await getJson("/api/admin/orders");
    document.getElementById("adminOrderCount").textContent = `${orders.length} customer accounts`;
    document.getElementById("adminOrderRows").innerHTML = orders.map(order => {
      const notes = [];
      if (order.courier && order.tracking_id) notes.push(`${order.courier} — ${order.tracking_id}.`);
      if (order.expected_delivery) notes.push(`Expected ${order.expected_delivery}.`);
      if (order.delivered_days_ago != null) notes.push(`Delivered ${order.delivered_days_ago} days ago.`);
      if (order.status === "Processing" && order.ordered_hours_ago != null) {
        notes.push(`Ordered ${order.ordered_hours_ago} hours ago. Eligible for cancellation.`);
      }
      return `<tr>
      <td><strong>${escapeHtml(order.order_id)}</strong><small>${escapeHtml(order.order_date)}</small></td>
      <td>${escapeHtml(order.customer)}</td>
      <td>${escapeHtml(order.product)}</td>
      <td>₹${escapeHtml(order.value_inr)}</td>
      <td>${escapeHtml(order.status)}</td>
      <td>${notes.length ? escapeHtml(notes.join(" ")) : "—"}</td>
      <td>${order.status !== "Cancelled" ? `<button class="button button-small admin-cancel-order" type="button" data-admin-cancel="${escapeHtml(order.order_id)}">Cancel order</button>` : "Cancelled"}</td>
    </tr>`;
    }).join("");
    orderMessage.classList.add("hidden");
    return true;
  } catch {
    orderMessage.textContent = "Customer order details could not be loaded. Refresh the page or sign in again.";
    orderMessage.classList.add("error-note");
    orderMessage.classList.remove("hidden");
    return false;
  }
}

async function initAdminDashboard() {
  await loadAdminOrders();
  const policyFields = document.getElementById("adminPolicyFields");
  const policyMessage = document.getElementById("adminPolicyMessage");
  const saveButton = document.getElementById("savePolicies");

  document.getElementById("adminOrderRows").addEventListener("click", async event => {
    const button = event.target.closest("[data-admin-cancel]");
    if (!button) return;
    button.disabled = true;
    const orderId = button.dataset.adminCancel;
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "The order could not be cancelled.");
      await loadAdminOrders();
    } catch (error) {
      document.getElementById("adminOrdersMessage").textContent = error.message || "The order could not be cancelled.";
      document.getElementById("adminOrdersMessage").classList.add("error-note");
      document.getElementById("adminOrdersMessage").classList.remove("hidden");
      button.disabled = false;
    }
  });

  try {
    const { policies } = await getJson("/api/policies");
    policyFields.innerHTML = policies.map((policy, index) => `<article class="admin-policy-item">
      <h3>${escapeHtml(policy.title)}</h3>
      <input type="hidden" name="title" value="${escapeHtml(policy.title)}">
      <input type="hidden" name="icon" value="${escapeHtml(policy.icon)}">
      <label for="policySummary${index}">Summary</label>
      <input id="policySummary${index}" name="summary" required maxlength="300" value="${escapeHtml(policy.summary)}">
      <label for="policyDetails${index}">Details</label>
      <textarea id="policyDetails${index}" name="details" required maxlength="2000">${escapeHtml(policy.details)}</textarea>
    </article>`).join("");
  } catch {
    policyFields.innerHTML = '<p class="error-note" role="alert">Brand policies could not be loaded. Refresh the page or sign in again.</p>';
    saveButton.disabled = true;
  }

  document.getElementById("adminPolicyForm").addEventListener("submit", async event => {
    event.preventDefault();
    policyMessage.classList.add("hidden");
    saveButton.disabled = true;
    saveButton.textContent = "Saving policies…";
    const cards = [...policyFields.querySelectorAll(".admin-policy-item")];
    const policies = cards.map(card => Object.fromEntries(
      [...card.querySelectorAll("input, textarea")].map(input => [input.name, input.value.trim()])
    ));
    try {
      const response = await fetch("/api/admin/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Policies could not be saved.");
      policyMessage.textContent = "Brand policies saved.";
      policyMessage.className = "admin-status";
    } catch (error) {
      policyMessage.textContent = error.message || "Policies could not be saved.";
      policyMessage.className = "form-error";
    } finally {
      policyMessage.classList.remove("hidden");
      saveButton.disabled = false;
      saveButton.textContent = "Save policies";
    }
  });
}

async function initLogin() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/";
  try {
    const sessionResponse = await fetch("/api/session");
    if (sessionResponse.ok) {
      const session = await sessionResponse.json();
      if (session.signed_in) {
        window.location.replace(session.role === "admin" ? "/admin" : "/orders");
        return;
      }
    }
  } catch {
    // The sign-in form will show a service error when it loads its challenge or orders.
  }
  try {
    await loadCaptcha();
  } catch {
    document.getElementById("loginError").textContent = "Could not load the CAPTCHA. Check the support service and refresh the page.";
    document.getElementById("loginError").classList.remove("hidden");
  }
  let selectedRole = "customer";
  const updateLoginRole = role => {
    selectedRole = role;
    const isCustomer = role === "customer";
    document.querySelectorAll(".login-role-option").forEach(button => {
      const active = button.dataset.role === role;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.getElementById("nameLabel").textContent = isCustomer ? "Your name" : "Admin username";
    document.getElementById("customerName").placeholder = isCustomer ? "For example, Priya Sharma" : "Admin username";
    document.getElementById("customerOrderFields").hidden = !isCustomer;
    document.getElementById("orderReference").required = isCustomer;
    document.getElementById("captchaRow").hidden = !isCustomer;
    document.getElementById("captchaCode").required = isCustomer;
    document.getElementById("passwordLabel").textContent = isCustomer ? "Your password" : "Admin password";
    document.getElementById("loginPassword").required = true;
    document.getElementById("loginSubmit").innerHTML = isCustomer
      ? "Continue to your order <span>↗</span>"
      : "Continue to admin dashboard <span>↗</span>";
    document.getElementById("loginError").classList.add("hidden");
  };
  document.querySelectorAll(".login-role-option").forEach(button => {
    button.addEventListener("click", () => updateLoginRole(button.dataset.role));
  });
  const prefilledName = params.get("name");
  const prefilledOrder = params.get("order");
  if (prefilledName) document.getElementById("customerName").value = prefilledName;
  if (prefilledOrder) document.getElementById("orderReference").value = prefilledOrder;
  document.getElementById("refreshCaptcha").addEventListener("click", async () => {
    try {
      await loadCaptcha();
      document.getElementById("captchaCode").value = "";
    } catch {
      document.getElementById("loginError").textContent = "Could not refresh the CAPTCHA. Please reload the page.";
      document.getElementById("loginError").classList.remove("hidden");
    }
  });
  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const error = document.getElementById("loginError");
    const submit = document.getElementById("loginSubmit");
    error.classList.add("hidden");
    submit.disabled = true;
    submit.innerHTML = "Checking your details…";
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          name: form.get("name"),
          password: form.get("password") || "",
          captcha_id: form.get("captcha_id"),
          captcha_code: form.get("captcha_code"),
          order_reference: form.get("order_reference")
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "We could not verify those details.");
      const destination = result.role === "admin" ? "/admin" : "/orders";
      window.location.assign(destination);
    } catch (err) {
      error.textContent = err.message || "Sign-in failed. Please try again.";
      error.classList.remove("hidden");
      if (selectedRole === "customer") {
        try { await loadCaptcha(); } catch { /* Preserve the original login error. */ }
        document.getElementById("captchaCode").value = "";
      }
      submit.disabled = false;
      submit.innerHTML = selectedRole === "customer"
        ? "Continue to your order <span>↗</span>"
        : "Continue to admin dashboard <span>↗</span>";
    }
  });
  document.querySelector(".intro-splash")?.classList.add("show");
  window.setTimeout(() => document.querySelector(".intro-splash")?.classList.add("dismiss"), 1350);
}

async function initBooking() {
  const productRoot = document.getElementById("bookingProduct");
  const form = document.getElementById("bookingForm");
  const error = document.getElementById("bookingError");
  const submit = document.getElementById("continuePayment");
  const productId = new URLSearchParams(window.location.search).get("product") || "";
  let product;
  try {
    const { products } = await getJson("/api/booking/products");
    product = products.find(item => item.product_id === productId);
    if (!product) throw new Error("Choose a product from the Aura home page to start booking.");
    productRoot.innerHTML = `<img src="${escapeHtml(product.product_image)}" alt="${escapeHtml(product.product)}"><div><span class="eyebrow">SELECTED PRODUCT · ${escapeHtml(product.product_id)}</span><h2>${escapeHtml(product.product)}</h2><p>${escapeHtml(product.description)}</p><strong class="checkout-price">₹${escapeHtml(product.price_inr)}</strong><p class="checkout-privacy">${escapeHtml(product.shipping_note)}</p></div>`;
    document.getElementById("sampleCustomerMatch").textContent = `Sample record: ${product.customer} · ${product.product_id}. Use the customer name already assigned to this product.`;
  } catch (requestError) {
    productRoot.innerHTML = `<p class="error-note">${escapeHtml(requestError.message || "Product details could not be loaded.")} <a class="text-link" href="/">Return to home →</a></p>`;
    form.hidden = true;
    return;
  }

  const customerName = document.getElementById("bookingName");
  const phoneInput = document.getElementById("bookingPhone");
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
  });
  if (account.session?.role === "customer") {
    customerName.value = account.session.customer;
    customerName.readOnly = true;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.classList.add("hidden");
    submit.disabled = true;
    submit.textContent = "Saving your details…";
    const values = new FormData(form);
    try {
      const response = await fetch("/api/checkout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: values.get("customer_name"),
          phone: values.get("phone"),
          address: values.get("address"),
          product_id: product.product_id
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Your booking details could not be saved.");
      window.location.assign("/payment");
    } catch (requestError) {
      error.textContent = requestError.message || "Your booking details could not be saved.";
      error.classList.remove("hidden");
      submit.disabled = false;
      submit.innerHTML = "Continue to payment <span>↗</span>";
    }
  });
}

async function initPayment() {
  const content = document.getElementById("paymentContent");
  const summary = document.getElementById("paymentSummary");
  const form = document.getElementById("paymentForm");
  const payerName = document.getElementById("payerName");
  const methodNote = document.getElementById("paymentMethodNote");
  const error = document.getElementById("paymentError");
  const submit = document.getElementById("placeOrder");
  const success = document.getElementById("paymentSuccess");
  let draft;
  let paymentMethod = "gpay";
  try {
    const response = await fetch("/api/checkout/draft");
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Your checkout expired. Start your booking again.");
    draft = result;
    payerName.value = draft.customer;
    document.querySelector(".header-actions .header-cta")?.setAttribute("href", `/book?product=${encodeURIComponent(draft.product_id)}`);
    summary.innerHTML = `<img src="${escapeHtml(draft.product_image)}" alt="${escapeHtml(draft.product)}"><div><span class="eyebrow">ORDER ${escapeHtml(draft.order_id)}</span><h2>${escapeHtml(draft.product)}</h2><p>${escapeHtml(draft.product_size)} · ${escapeHtml(draft.delivery_estimate)}</p><strong class="checkout-price">₹${escapeHtml(draft.price_inr)}</strong><p class="checkout-privacy">${escapeHtml(draft.shipping_note)}</p></div>`;
  } catch (requestError) {
    summary.innerHTML = `<p class="error-note">${escapeHtml(requestError.message || "Your checkout expired.")} <a class="text-link" href="/">Choose a product again →</a></p>`;
    form.hidden = true;
    return;
  }

  const updateMethod = method => {
    paymentMethod = method;
    document.querySelectorAll("[data-payment-method]").forEach(button => {
      const selected = button.dataset.paymentMethod === method;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const cashOnDelivery = method === "cod";
    methodNote.textContent = cashOnDelivery
      ? "Cash on Delivery is recorded for this demo order. No money is collected now. Never enter card, UPI PIN, or banking details."
      : "Demo UPI: confirming records a simulated success only. A dummy reference is generated. Never enter a card number, UPI PIN, or banking password.";
    submit.textContent = cashOnDelivery
      ? `Place demo COD order · ₹${draft.price_inr}`
      : `Complete demo payment · ₹${draft.price_inr}`;
  };
  document.querySelectorAll("[data-payment-method]").forEach(button => {
    button.addEventListener("click", () => updateMethod(button.dataset.paymentMethod));
  });
  updateMethod(paymentMethod);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.classList.add("hidden");
    submit.disabled = true;
    submit.textContent = paymentMethod === "cod" ? "Placing your demo order…" : "Confirming demo payment…";
    try {
      const response = await fetch("/api/checkout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payer_name: payerName.value, payment_method: paymentMethod })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Your demo order could not be completed.");
      content.classList.add("hidden");
      success.classList.remove("hidden");
      const loginUrl = `/login?next=%2Forders&name=${encodeURIComponent(result.customer)}&order=${encodeURIComponent(result.order_id)}`;
      const orderUrl = account.session?.role === "customer" && account.session.order?.order_id === result.order_id
        ? "/orders"
        : loginUrl;
      success.innerHTML = `<div class="success-mark">✓</div><div class="eyebrow">AURA SAMPLE ORDER · ${escapeHtml(result.order_id)}</div><h2>${result.payment_status === "Paid (demo only)" ? "Demo payment successful" : "Your demo order is booked"}</h2><p>${escapeHtml(result.message)}</p><div class="success-order"><strong>${escapeHtml(result.product)}</strong><span>${escapeHtml(result.customer)} · ₹${escapeHtml(result.price_inr)}</span><span>Status: ${escapeHtml(result.status)} · Delivery: ${escapeHtml(result.expected_delivery)}</span>${result.payment_reference ? `<span>Demo reference: ${escapeHtml(result.payment_reference)}</span>` : ""}</div><a class="button button-dark" href="${escapeHtml(orderUrl)}">${orderUrl === "/orders" ? "View your order" : `Sign in to view ${escapeHtml(result.order_id)}`} <span>↗</span></a><p class="checkout-privacy">Sign in with ${escapeHtml(result.customer)} and ${escapeHtml(result.order_id)} to see the updated order. Use the existing sample account password.</p>`;
    } catch (requestError) {
      error.textContent = requestError.message || "Your demo order could not be completed.";
      error.classList.remove("hidden");
      submit.disabled = false;
      updateMethod(paymentMethod);
    }
  });
}

function statusClass(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("processing")) return "status-green";
  if (normalized.includes("delivery") || normalized.includes("shipped")) return "status-blue";
  if (normalized.includes("cancel")) return "status-red";
  return "status-gray";
}

function questionForOrder(order) {
  if (order.status === "Processing") return `Can you cancel order ${order.order_id}?`;
  if (order.delivered_days_ago !== null && order.delivered_days_ago !== undefined) {
    return `Can I return order ${order.order_id}?`;
  }
  return `Where is my order ${order.order_id}?`;
}

function renderOrderCard(order, compact = false, dashboard = false) {
  const details = [];
  details.push(["Order date", order.order_date]);
  details.push(["Quantity", order.quantity]);
  details.push(["Payment", order.payment_method]);
  if (order.payment_status) details.push(["Payment status", order.payment_status]);
  if (order.payment_reference) details.push(["Demo transaction reference", order.payment_reference]);
  if (order.courier) details.push(["Courier", order.courier]);
  if (order.tracking_id) details.push(["Tracking ID", order.tracking_id]);
  if (order.expected_delivery) details.push(["Expected", order.expected_delivery]);
  if (order.delivered_days_ago !== null && order.delivered_days_ago !== undefined) details.push(["Delivered", `${order.delivered_days_ago} days ago`]);
  if (order.status === "Processing" && order.ordered_hours_ago != null) {
    details.push(["Ordered", `${order.ordered_hours_ago} hours ago`]);
  }
  const note = details.filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `<div class="order-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const highlights = (order.product_highlights || [])
    .map(highlight => `<li>${escapeHtml(highlight)}</li>`).join("");
  const orderQuestion = questionForOrder(order);
  const productQuestion = `Can you tell me more about the ${order.product} in my order ${order.order_id}?`;
  return `<article class="order-card ${compact ? "compact" : ""}" data-search="${escapeHtml(`${order.order_id} ${order.customer} ${order.product} ${order.status} ${order.order_date}`.toLowerCase())}">
    <div class="order-top"><span class="order-id">${escapeHtml(order.order_id)}</span><span class="status ${statusClass(order.status)}">${escapeHtml(order.status)}</span></div>
    <img class="product-image" src="${escapeHtml(order.product_image)}" alt="${escapeHtml(order.product)} product image" loading="lazy">
    <h3>${escapeHtml(order.product)}</h3>
    <p class="product-description">${escapeHtml(order.product_description)}</p>
    <div class="product-meta"><span>${escapeHtml(order.product_size)}</span><span>Qty ${escapeHtml(order.quantity)}</span></div>
    ${highlights ? `<ul class="product-highlights">${highlights}</ul>` : ""}
    ${!compact ? `<p class="product-usage"><strong>How to use</strong><br>${escapeHtml(order.how_to_use)}</p>` : ""}
    <p class="order-customer">${escapeHtml(order.customer)} · ₹${escapeHtml(order.estimated_total_inr ?? order.value_inr)}</p>
    ${note}
    ${dashboard ? "" : `<a class="try-btn" href="/voice?prompt=${encodeURIComponent(orderQuestion)}">Need order help? Ask Aria ↗</a>
    <a class="product-support-link" href="/voice?prompt=${encodeURIComponent(productQuestion)}">Ask Aria about this product</a>`}
  </article>`;
}

async function loadOrders(target, compact = false) {
  const container = document.getElementById(target);
  if (!container) return [];
  try {
    const data = await getJson("/api/orders");
    const allOrders = data.orders || [];
    const orders = account.session
      ? allOrders.filter(order => order.order_id === account.session.order.order_id)
      : allOrders;
    container.innerHTML = orders.length ? orders.map(order => renderOrderCard(order, compact)).join("") : '<p class="empty-note">There are no sample orders right now.</p>';
    return orders;
  } catch {
    container.innerHTML = '<p class="error-note">Could not load sample orders. Please refresh or check that the support service is running.</p>';
    return [];
  }
}

async function initOrders() {
  const grid = document.getElementById("customerOrder");
  if (!grid) return;
  const detailPanel = document.getElementById("customerDetailsPanel");
  const actionPanel = document.getElementById("customerActionsPanel");
  const customerOrder = document.getElementById("customerOrder");
  const actionRoot = document.getElementById("customerOrderActions");
  const pageMessage = document.getElementById("customerDashboardMessage");
  const setPanel = name => {
    const showDetails = name === "details";
    detailPanel.hidden = !showDetails;
    actionPanel.hidden = showDetails;
    document.querySelectorAll("[data-dashboard-tab]").forEach(button => {
      const active = button.dataset.dashboardTab === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  };
  document.querySelectorAll("[data-dashboard-tab]").forEach(button => {
    button.onclick = () => setPanel(button.dataset.dashboardTab);
  });

  const showDamageChoice = report => {
    const existing = document.getElementById("damageReportResult");
    if (!existing) return;
    existing.textContent = `${report.status}${report.resolution ? ` — ${report.resolution}` : ""}`;
    existing.classList.remove("hidden");
    const choiceActions = document.getElementById("damageChoiceActions");
    if (choiceActions) choiceActions.classList.toggle("hidden", Boolean(report.resolution));
    const form = document.getElementById("damageReportForm");
    if (form) form.classList.add("hidden");
  };

  try {
    if (!account.session || account.session.role !== "customer") {
      window.location.replace("/login?next=/orders");
      return;
    }
    const { orders } = await getJson("/api/orders");
    if (orders.length !== 1 || orders[0].order_id !== account.session.order?.order_id) {
      throw new Error("We could not verify the order linked to this account. Please sign in again.");
    }
    const order = orders[0];
    document.getElementById("dashboardCustomer").textContent = order.customer;
    customerOrder.innerHTML = renderOrderCard(order, false, true);
    customerOrder.insertAdjacentHTML("beforeend", `<div class="order-location-details">
      <h3>Delivery and tracking</h3>
      <div class="order-detail"><span>Delivery address</span><strong>${escapeHtml(order.shipping_address || "Not provided in the sample order")}</strong></div>
      ${order.shipping_phone ? `<div class="order-detail"><span>Contact number</span><strong>${escapeHtml(order.shipping_phone)}</strong></div>` : ""}
      <div class="order-detail"><span>Dispatch origin</span><strong>Not included in this demo order</strong></div>
      <div class="order-detail"><span>Current carrier location</span><strong>${order.tracking_id ? `Not available in demo · ${escapeHtml(order.courier)} tracking ${escapeHtml(order.tracking_id)}` : "Tracking begins after dispatch"}</strong></div>
      <div class="order-detail"><span>Delivery estimate</span><strong>${escapeHtml(order.expected_delivery || (order.delivered_days_ago != null ? `Delivered ${order.delivered_days_ago} days ago` : "Shared after dispatch"))}</strong></div>
    </div>`);
    const cancellationEligible = order.status === "Processing";
    const damageEligible = order.status === "Delivered" && order.delivered_hours_ago != null && order.delivered_hours_ago <= 48;
    const damageContent = order.damage_report
      ? `<div class="damage-report-card"><p id="damageReportResult" class="admin-status"></p>
          <p class="damage-description"><strong>Your report:</strong> ${escapeHtml(order.damage_report.description)}</p>
          <div id="damageChoiceActions" class="${order.damage_report.resolution ? "hidden" : "damage-choice-actions"}">
            <p>Would you prefer a refund or a replacement?</p>
            <p class="small-hint">This demo records your choice only; it does not issue a payment refund or ship a replacement.</p>
            <button class="button button-dark button-small" type="button" data-damage-choice="refund">Refund</button>
            <button class="button button-outline button-small" type="button" data-damage-choice="replacement">Replacement</button>
          </div>
        </div>`
      : `<p class="side-desc">${damageEligible
        ? "This delivered order is within the 48-hour reporting window. Include a photo so your request can be reviewed."
        : order.status === "Delivered"
          ? "This order was delivered more than 48 hours ago. Aura's damage policy requires reports within 48 hours of delivery; the server will verify eligibility."
          : "You can describe an issue here. A damage claim becomes eligible only after delivery and must be reported within 48 hours with a photo."}</p>
          <form id="damageReportForm" class="damage-report-form">
            <label for="damageDescription">How was the product damaged?</label>
            <textarea id="damageDescription" name="description" required minlength="10" maxlength="2000" rows="4" placeholder="Describe what arrived damaged or defective"></textarea>
            <label for="damagePhoto">Photo of the damage (PNG, JPG, or WebP)</label>
            <input id="damagePhoto" name="photo" type="file" accept="image/png,image/jpeg,image/webp" required>
            <p id="damageFormMessage" class="form-error hidden" role="alert"></p>
            <button class="button button-dark" type="submit">Submit damage report</button>
          </form>`;
    actionRoot.innerHTML = `<div class="customer-action-card">
      <h3>Cancel order</h3>
      <p>${cancellationEligible
        ? "This order is still Processing and can be cancelled under Aura's policy."
        : order.status === "Cancelled"
          ? "This order has been cancelled."
          : "Orders can only be cancelled while Processing. Shipped or delivered orders are no longer eligible."}</p>
      <button id="customerCancelOrder" class="button ${cancellationEligible ? "button-dark" : "button-outline"}" type="button" ${order.status === "Cancelled" ? "disabled" : ""}>${order.status === "Cancelled" ? "Order cancelled" : "Cancel this order"}</button>
      <p id="cancelOrderMessage" class="admin-status hidden" role="status"></p>
    </div>
    <div class="customer-action-card">
      <h3>Report damage or defect</h3>
      ${damageContent}
    </div>`;

    if (order.damage_report) showDamageChoice(order.damage_report);
    document.getElementById("customerCancelOrder").addEventListener("click", async event => {
      const button = event.currentTarget;
      const message = document.getElementById("cancelOrderMessage");
      button.disabled = true;
      try {
        const response = await fetch("/api/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: order.order_id })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.detail || result.message || "This order could not be cancelled.");
        message.textContent = result.message;
        message.classList.remove("hidden", "form-error");
        message.classList.add("admin-status");
        await initOrders();
        setPanel("actions");
      } catch (error) {
        message.textContent = error.message || "This order could not be cancelled.";
        message.classList.remove("hidden", "admin-status");
        message.classList.add("form-error");
        button.disabled = false;
      }
    });
    const damageForm = document.getElementById("damageReportForm");
    damageForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const message = document.getElementById("damageFormMessage");
      const submit = damageForm.querySelector('[type="submit"]');
      const photo = document.getElementById("damagePhoto").files[0];
      if (!photo || photo.size > 5_000_000) {
        message.textContent = "Choose a photo smaller than 5 MB.";
        message.classList.remove("hidden");
        return;
      }
      submit.disabled = true;
      message.classList.add("hidden");
      try {
        const photoDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("The photo could not be read. Please choose it again."));
          reader.readAsDataURL(photo);
        });
        const response = await fetch(`/api/orders/${encodeURIComponent(order.order_id)}/damage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: document.getElementById("damageDescription").value.trim(), photo_data_url: photoDataUrl })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "The damage report could not be submitted.");
        await initOrders();
        setPanel("actions");
      } catch (error) {
        message.textContent = error.message || "The damage report could not be submitted.";
        message.classList.remove("hidden");
        submit.disabled = false;
      }
    });
    document.querySelectorAll("[data-damage-choice]").forEach(button => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const response = await fetch(`/api/orders/${encodeURIComponent(order.order_id)}/damage/resolution`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ choice: button.dataset.damageChoice })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.detail || "The resolution could not be recorded.");
          await initOrders();
          setPanel("actions");
        } catch (error) {
          const result = document.getElementById("damageReportResult");
          result.textContent = error.message || "The resolution could not be recorded.";
          result.classList.remove("hidden");
          button.disabled = false;
        }
      });
    });
    pageMessage.classList.add("hidden");
    setPanel("details");
  } catch (error) {
    customerOrder.innerHTML = `<p class="error-note">${escapeHtml(error.message || "Could not load your order. Please sign in again.")}</p>`;
    actionRoot.replaceChildren();
    pageMessage.textContent = error.message || "Could not load your order. Please sign in again.";
    pageMessage.classList.remove("hidden");
  }
}

async function initPolicies() {
  const root = document.getElementById("policyGrid");
  if (!root) return;
  try {
    const data = await getJson("/api/policies");
    root.innerHTML = data.policies.map((policy, index) => `<article class="policy-card">
      <div class="policy-card-top"><span class="policy-icon">${escapeHtml(policy.icon)}</span><span class="eyebrow">0${index + 1} · AURA CARE</span></div>
      <h2>${escapeHtml(policy.title)}</h2><p class="policy-summary">${escapeHtml(policy.summary)}</p><div class="policy-divider"></div><p class="policy-details">${escapeHtml(policy.details)}</p>
    </article>`).join("");
  } catch {
    root.innerHTML = '<p class="error-note">Could not load the policy guide. Please refresh or check that the support service is running.</p>';
  }
}

const call = {
  active: false,
  busy: false,
  messages: [],
  history: [],
  recognition: null,
  shouldListen: false,
  transcriptionConfigured: false,
  recorder: null,
  mediaStream: null,
  audioChunks: [],
  submitRecording: false,
  recordingTimeout: null,
  utterance: null,
  callEnded: false
};

const byId = id => document.getElementById(id);
const voiceRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function setCallState(name, headline, subline) {
  if (!byId("stateText")) return;
  byId("stateText").textContent = name;
  byId("headline").textContent = headline;
  byId("subline").textContent = subline;
  byId("stateBadge").className = `state-badge${["Listening", "Thinking", "Speaking"].includes(name) ? " live" : ""}`;
  byId("orb").classList.toggle("active", ["Listening", "Thinking", "Speaking"].includes(name));
  byId("wave").classList.toggle("active", ["Listening", "Speaking"].includes(name));
}

function renderTranscript() {
  const root = byId("transcript");
  if (!root) return;
  byId("transcriptCount").textContent = `${call.messages.length} message${call.messages.length === 1 ? "" : "s"}`;
  if (!call.messages.length) {
    root.className = "transcript empty";
    root.innerHTML = '<div class="empty-icon">◌</div><p>Your conversation will appear here.</p>';
    return;
  }
  root.className = "transcript";
  root.innerHTML = call.messages.map(message => `<div class="message ${message.role}">
    <div class="msg-avatar">${message.role === "user" ? "YOU" : "✦"}</div>
    <div class="msg-content"><div class="msg-meta">${message.role === "user" ? "Customer" : "Aria"} · ${escapeHtml(message.time)}</div><div class="msg-text">${escapeHtml(message.content)}</div></div>
  </div>`).join("");
  root.scrollTop = root.scrollHeight;
}

function addTranscriptMessage(role, content) {
  call.messages.push({ role, content, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  renderTranscript();
}

function speak(text) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) return resolve();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    call.utterance = utterance;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(speechTimeout);
      call.utterance = null;
      resolve();
    };
    const speechTimeout = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      finish();
    }, Math.max(10000, Math.min(30000, text.length * 100)));
    const voices = window.speechSynthesis.getVoices();
    const indianVoice = voices.find(voice => /en-IN/i.test(voice.lang)) || voices.find(voice => /India/i.test(voice.name));
    if (indianVoice) utterance.voice = indianVoice;
    utterance.lang = indianVoice?.lang || "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1.02;
    utterance.onstart = () => setCallState("Speaking", "Aria is speaking", "Listen to the response, then ask your next question.");
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

function startVoiceRecognition() {
  try {
    call.recognition.start();
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "InvalidStateError") return true;
    call.shouldListen = false;
    call.recognition = null;
    byId("startBtn").disabled = false;
    byId("startBtn").innerHTML = "<span>●</span> Try voice again";
    const reason = error instanceof Error ? error.name : "Unknown error";
    showServerRecordingFallback("Couldn’t start browser voice input.", `Speech recognition returned ${reason}.`);
    return false;
  }
}

async function startServerRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setCallState("Voice unavailable", "Audio recording is not supported", "Use a current browser or type your question below.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .find(type => window.MediaRecorder.isTypeSupported(type));
    const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    call.mediaStream = stream;
    call.recorder = recorder;
    call.audioChunks = [];
    call.submitRecording = false;
    recorder.ondataavailable = event => {
      if (event.data.size) call.audioChunks.push(event.data);
    };
    recorder.onerror = () => {
      call.submitRecording = false;
      try { recorder.stop(); } catch { /* The recorder may already be stopped. */ }
      setCallState("Recording failed", "Couldn’t record audio", "Check microphone access and try again, or type your question below.");
    };
    recorder.onstop = () => {
      const blob = new Blob(call.audioChunks, { type: recorder.mimeType || "audio/webm" });
      call.mediaStream?.getTracks().forEach(track => track.stop());
      call.mediaStream = null;
      call.recorder = null;
      call.audioChunks = [];
      const shouldSubmit = call.submitRecording && call.active;
      call.submitRecording = false;
      byId("recordBtn").disabled = false;
      byId("recordBtn").innerHTML = "<span>●</span> Record a question";
      if (shouldSubmit) void transcribeRecording(blob);
    };
    recorder.start();
    call.recordingTimeout = window.setTimeout(() => stopServerRecording(false), 30000);
    byId("recordBtn").innerHTML = "<span>■</span> Stop & send";
    setCallState("Recording", "I’m listening", "Ask your question, then tap Stop & send. The short recording will be sent to OpenAI for transcription.");
  } catch (error) {
    const reason = error instanceof Error ? error.name : "Unknown error";
    setCallState("Microphone unavailable", "Couldn’t access the microphone", `Allow microphone access (${reason}), then record again or type your question.`);
  }
}

function stopServerRecording(submit) {
  const recorder = call.recorder;
  if (!recorder || recorder.state === "inactive") return;
  call.submitRecording = submit;
  window.clearTimeout(call.recordingTimeout);
  call.recordingTimeout = null;
  byId("recordBtn").disabled = true;
  setCallState("Thinking", submit ? "Transcribing your question" : "Recording stopped", submit
    ? "Sending this short recording to OpenAI for transcription."
    : "The recording was discarded. Tap Record a question to try again.");
  recorder.stop();
}

async function transcribeRecording(blob) {
  if (!blob.size) {
    setCallState("No speech detected", "No audio was recorded", "Try recording again and speak clearly, or type your question.");
    return;
  }
  if (blob.size > 20 * 1024 * 1024) {
    setCallState("Recording too large", "Please record a shorter question", "Keep the recording under 20 MB and try again.");
    return;
  }
  byId("recordBtn").disabled = true;
  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `Transcription service returned ${response.status}.`);
    if (!data.text?.trim()) throw new Error("No speech was detected. Try recording again and speak clearly.");
    await sendVoiceMessage(data.text.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : "The transcription service could not process the recording.";
    setCallState("Transcription failed", "Couldn’t transcribe that recording", `${message} You can record again or type your question.`);
  } finally {
    byId("recordBtn").disabled = false;
  }
}

function showServerRecordingFallback(headline, detail) {
  call.shouldListen = false;
  call.recognition = null;
  byId("startBtn").disabled = false;
  byId("startBtn").innerHTML = "<span>●</span> Try browser voice";
  if (call.transcriptionConfigured) {
    byId("recordBtn").hidden = false;
    byId("recordBtn").classList.remove("hidden");
    setCallState("Server voice available", headline, `${detail} Tap Record a question to use server transcription. Audio is sent to OpenAI.`);
  } else {
    setCallState("Voice service unavailable", headline, `${detail} Server transcription needs OPENAI_API_KEY configured on the backend; type your question in the meantime.`);
  }
}

function startCall(withMic = true) {
  if (call.active && (!withMic || call.shouldListen)) return;
  if (!call.active) {
    call.active = true;
    call.callEnded = false;
    call.messages = [];
    call.history = [];
    renderTranscript();
  }
  call.shouldListen = withMic;
  byId("recordBtn").hidden = true;
  byId("recordBtn").classList.add("hidden");
  byId("startBtn").disabled = withMic;
  byId("startBtn").innerHTML = withMic ? "<span>●</span> Start Call" : "<span>●</span> Start voice";
  byId("endBtn").disabled = false;
  if (withMic && !call.recognition && voiceRecognition) {
    const recognition = new voiceRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    let finalText = "";
    recognition.onstart = () => {
      if (call.active && !call.busy) setCallState("Listening", "I’m listening", "Speak naturally. I’ll respond when you finish.");
    };
    recognition.onresult = event => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) finalText += event.results[index][0].transcript;
        else interim += event.results[index][0].transcript;
      }
      if (interim) byId("subline").textContent = `I heard: “${interim}”`;
      if (finalText.trim()) {
        const message = finalText.trim();
        finalText = "";
        call.shouldListen = true;
        sendVoiceMessage(message);
      }
    };
    recognition.onerror = event => {
      if (event.error === "not-allowed") {
        call.shouldListen = false;
        call.recognition = null;
        byId("startBtn").disabled = false;
        showServerRecordingFallback("Browser microphone permission is needed.", "Allow microphone access to use voice input.");
      } else if (event.error === "network" || event.error === "service-not-allowed") {
        showServerRecordingFallback(
          "Browser speech recognition couldn’t connect.",
          "Your microphone is available, but the browser speech service could not connect."
        );
      } else if (event.error === "audio-capture") {
        call.shouldListen = false;
        call.recognition = null;
        byId("startBtn").disabled = false;
        byId("startBtn").innerHTML = "<span>●</span> Try voice again";
        setCallState("Microphone unavailable", "No microphone input detected", "Check that your microphone is connected and enabled, then start a new call or type your question.");
      } else if (event.error === "no-speech" && call.active) {
        setCallState("Listening", "No speech detected", "Move closer to the microphone and speak clearly, or type your question below.");
      } else if (call.active && event.error !== "aborted") {
        call.shouldListen = false;
        call.recognition = null;
        byId("startBtn").disabled = false;
        byId("startBtn").innerHTML = "<span>●</span> Try voice again";
        setCallState("Voice input error", "Voice input stopped", `Speech recognition reported “${event.error}”. You can type your question or start a new call.`);
      }
    };
    recognition.onend = () => {
      if (call.active && call.shouldListen && !call.busy && !window.speechSynthesis?.speaking) {
        window.setTimeout(() => {
          if (call.active && call.shouldListen && !call.busy) startVoiceRecognition();
        }, 250);
      }
    };
    call.recognition = recognition;
  }
  if (withMic && !call.recognition) {
    showServerRecordingFallback(
      "Browser speech recognition is not supported here.",
      "You can use server transcription or type your question."
    );
  } else if (withMic) {
    if (call.busy || window.speechSynthesis?.speaking) {
      setCallState("Speaking", "Aria is responding", "Voice input will start as soon as Aria finishes.");
    } else {
      setCallState("Listening", "I’m listening", "Ask a question about an Aura Skincare order.");
      startVoiceRecognition();
    }
  } else {
    call.shouldListen = false;
    setCallState("Call active", "Ready for your question", "Type a message or start a new call with your microphone.");
  }
}

async function sendVoiceMessage(rawText) {
  const message = rawText.trim();
  if (!message || call.busy) return;
  if (!call.active) startCall(false);
  byId("typedInput").value = "";
  call.busy = true;
  addTranscriptMessage("user", message);
  setCallState("Thinking", "Aria is thinking", "Checking your question and the relevant Aura policies.");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: call.history.slice(-10) })
    });
    if (!response.ok) throw new Error(`Support service returned ${response.status}`);
    const data = await response.json();
    const reply = data.reply || "I’m sorry, could you please repeat that?";
    addTranscriptMessage("assistant", reply);
    call.history.push({ role: "user", content: message }, { role: "assistant", content: reply });
    await speak(reply);
  } catch {
    const reply = "I’m sorry, I couldn’t reach the support service. Please try again in a moment.";
    addTranscriptMessage("assistant", reply);
    await speak(reply);
  } finally {
    call.busy = false;
    if (call.active && call.shouldListen && call.recognition) {
      setCallState("Listening", "I’m listening", "Go ahead, I’m here to help.");
      try { call.recognition.start(); } catch { /* Recognition can be in its onend transition. */ }
    } else if (call.active && call.shouldListen) {
      setCallState("Voice service unavailable", "Couldn’t restart voice input", "The browser could not resume speech recognition. Type your question below or start a new call.");
      call.shouldListen = false;
    } else if (call.active) {
      setCallState("Call active", "Ready for your next question", "You can type another message in this conversation.");
    }
  }
}

function endCall() {
  if (!call.active) return;
  call.active = false;
  call.shouldListen = false;
  call.callEnded = true;
  stopServerRecording(false);
  try { call.recognition?.stop(); } catch { /* It may already be stopped. */ }
  call.recognition = null;
  byId("recordBtn").hidden = true;
  byId("recordBtn").classList.add("hidden");
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  byId("startBtn").disabled = false;
  byId("startBtn").innerHTML = "<span>●</span> Start Call";
  byId("endBtn").disabled = true;
  setCallState("Call ended", "Thank you for talking with Aura", "Your call transcript remains available above.");
}

async function initVoice() {
  if (!byId("startBtn")) return;
  const signedIn = Boolean(account.session);
  if (!signedIn) byId("headline").textContent = "Product & policy support";
  setCallState("Ready", "Ready when you are", signedIn
    ? "Ask Aria about your order, Aura products, or our policies."
    : "Ask Aria about Aura products or policies. Sign in for help with a specific order.");
  if (!voiceRecognition) byId("subline").textContent = "Speech recognition may not be supported here. Typed support is available.";
  const orderPanel = byId("voiceOrders");
  if (orderPanel && !signedIn) {
    orderPanel.innerHTML = '<p class="side-desc">Sign in with the matching customer name and order ID for personalized tracking and order support.</p><a class="text-link" href="/login">Sign in for order support →</a>';
    const heading = orderPanel.closest(".side-card")?.querySelector("h2");
    if (heading) heading.textContent = "Personalized order help";
    const description = orderPanel.closest(".side-card")?.querySelector(".side-desc");
    if (description) description.textContent = "Sign in to securely access your order details. You can use Aria for product and policy questions without signing in.";
    const orderLink = orderPanel.parentElement?.querySelector('a[href="/orders"]');
    if (orderLink) orderLink.classList.add("hidden");
  }
  byId("startBtn").addEventListener("click", () => startCall(true));
  byId("recordBtn").addEventListener("click", () => {
    if (call.recorder?.state === "recording") stopServerRecording(true);
    else void startServerRecording();
  });
  byId("endBtn").addEventListener("click", endCall);
  byId("sendBtn").addEventListener("click", () => sendVoiceMessage(byId("typedInput").value));
  byId("typedInput").addEventListener("keydown", event => {
    if (event.key === "Enter") sendVoiceMessage(byId("typedInput").value);
  });
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt");
  if (prompt) {
    byId("typedInput").value = prompt;
    startCall(false);
    await sendVoiceMessage(prompt);
    window.history.replaceState({}, "", "/voice");
  }
  const pill = byId("modePill");
  try {
    const health = await getJson("/api/health");
    call.transcriptionConfigured = Boolean(health.transcription_configured);
    pill.innerHTML = `<i></i> ${health.ai_configured ? "AI backend connected" : "Backend connected · demo mode"}`;
  } catch {
    pill.innerHTML = '<i class="disconnected"></i> Support service unavailable';
  }
  if (signedIn) await loadOrders("voiceOrders", true);
}

async function boot() {
  initNavigation();
  if (document.body.dataset.page === "login") return initLogin();
  const signedIn = await initAccount();
  if (signedIn && account.session.role === "admin" && document.body.dataset.page !== "admin") {
    window.location.replace("/admin");
    return;
  }
  if (!signedIn && !["home", "policies", "voice", "booking", "payment"].includes(document.body.dataset.page)) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    return;
  }
  if (document.body.dataset.page === "home") {
    await initHome(signedIn);
    if (!sessionStorage.getItem("aura-intro-seen")) {
      const splash = document.querySelector(".intro-splash");
      splash?.classList.add("show");
      window.setTimeout(() => {
        splash?.classList.add("dismiss");
        sessionStorage.setItem("aura-intro-seen", "1");
      }, 1150);
    }
  }
  if (document.body.dataset.page === "orders") initOrders();
  if (document.body.dataset.page === "policies") initPolicies();
  if (document.body.dataset.page === "voice") {
    await initVoice();
  }
  if (document.body.dataset.page === "booking") await initBooking();
  if (document.body.dataset.page === "payment") await initPayment();
  if (document.body.dataset.page === "admin") await initAdminDashboard();
}

boot();
