(function () {
  const config = window.VIXTEV_SUPABASE_CONFIG || {};
  const createClient = window.supabase && typeof window.supabase.createClient === "function"
    ? window.supabase.createClient
    : null;

  const enabled = Boolean(createClient && config.url && config.anonKey);
  const client = enabled
    ? createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      })
    : null;

  function normalizeProfile(user, profile) {
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: profile?.full_name || user.user_metadata?.full_name || "",
      email: profile?.email || user.user_metadata?.email || "",
      phone: profile?.phone || user.user_metadata?.phone || ""
    };
  }

  async function getCurrentUser() {
    if (!enabled) {
      return null;
    }

    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return null;
    }

    return data.user;
  }

  async function ensureSession() {
    if (!enabled) {
      return null;
    }

    const currentUser = await getCurrentUser();
    if (currentUser) {
      return currentUser;
    }

    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      throw error;
    }

    return data.user || null;
  }

  async function saveProfile(profile) {
    if (!enabled) {
      return null;
    }

    const user = await ensureSession();
    if (!user) {
      throw new Error("Unable to create auth session.");
    }

    const payload = {
      id: user.id,
      full_name: profile?.name || "",
      email: profile?.email || "",
      phone: profile?.phone || ""
    };

    const { error } = await client.from("profiles").upsert(payload);
    if (error) {
      throw error;
    }

    return normalizeProfile(user, payload);
  }

  async function getCurrentProfile() {
    if (!enabled) {
      return null;
    }

    const user = await getCurrentUser();
    if (!user) {
      return null;
    }

    const { data } = await client
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    return normalizeProfile(user, data);
  }

  async function saveOrder(order) {
    if (!enabled) {
      return order;
    }

    const user = await ensureSession();
    if (!user) {
      throw new Error("Unable to create auth session.");
    }

    const orderPayload = {
      order_number: order.id,
      user_id: user.id,
      status: order.status,
      payment_method: order.paymentMethod,
      subtotal: order.subtotal || 0,
      discount: order.discount || 0,
      delivery_fee: order.delivery || 0,
      total: order.total || 0,
      shipping_address: {
        fullName: order.customer.fullName,
        phone: order.customer.phone,
        email: order.customer.email,
        address: order.customer.address,
        city: order.customer.city,
        state: order.customer.state,
        pincode: order.customer.pincode
      }
    };

    const { data: insertedOrder, error: orderError } = await client
      .from("orders")
      .insert(orderPayload)
      .select("id, order_number, created_at, status, payment_method, subtotal, discount, delivery_fee, total, shipping_address")
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderItems = order.items.map((item) => ({
      order_id: insertedOrder.id,
      product_id: item.id,
      product_title: item.title,
      product_category: item.category,
      product_brand: item.brand,
      product_image: item.image,
      unit_price: item.price,
      quantity: item.qty
    }));

    const { error: itemError } = await client.from("order_items").insert(orderItems);
    if (itemError) {
      throw itemError;
    }

    return mapOrder(insertedOrder, orderItems);
  }

  async function fetchOrders() {
    if (!enabled) {
      return [];
    }

    const user = await getCurrentUser();
    if (!user) {
      return [];
    }

    const { data: orders, error: orderError } = await client
      .from("orders")
      .select("id, order_number, created_at, status, payment_method, subtotal, discount, delivery_fee, total, shipping_address")
      .order("created_at", { ascending: false });

    if (orderError || !orders?.length) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const { data: items, error: itemError } = await client
      .from("order_items")
      .select("order_id, product_id, product_title, product_category, product_brand, product_image, unit_price, quantity")
      .in("order_id", orderIds);

    if (itemError) {
      throw itemError;
    }

    return orders.map((order) =>
      mapOrder(
        order,
        (items || []).filter((item) => item.order_id === order.id)
      )
    );
  }

  function mapOrder(order, items) {
    const shipping = order.shipping_address || {};
    const statusClassMap = {
      Processing: "status-pill--processing",
      Shipped: "status-pill--shipped",
      Delivered: "status-pill--delivered"
    };

    return {
      id: order.order_number || order.id,
      date: new Date(order.created_at || Date.now()).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
      }),
      paymentMethod: order.payment_method,
      customer: {
        fullName: shipping.fullName || "",
        phone: shipping.phone || "",
        email: shipping.email || "",
        address: shipping.address || "",
        city: shipping.city || "",
        state: shipping.state || "",
        pincode: shipping.pincode || ""
      },
      items: items.map((item) => ({
        id: item.product_id,
        title: item.product_title,
        category: item.product_category,
        brand: item.product_brand,
        image: item.product_image,
        price: Number(item.unit_price),
        qty: Number(item.quantity)
      })),
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      delivery: Number(order.delivery_fee || 0),
      total: Number(order.total || 0),
      status: order.status,
      statusClass: statusClassMap[order.status] || "status-pill--processing"
    };
  }

  window.VixtevSupabase = {
    enabled,
    saveProfile,
    getCurrentProfile,
    saveOrder,
    fetchOrders
  };
})();
