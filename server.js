/**
 * server.js
 * Express server for the Rathkeale Tuck Shop pre-order system.
 * Serves static HTML pages and provides a JSON API for the frontend.
 */

const express = require('express');
const db = require('./database');

// Load environment variables from a local .env file if one exists.
// This keeps secrets like the staff password out of the source code.
try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to real env vars or the placeholder default
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware — parse JSON request bodies and serve static files from /public
app.use(express.json());
app.use(express.static('public'));

// The staff password. Falls back to a default for local use, but can be
// overridden with the STAFF_PASSWORD environment variable so the real
// password never has to live in the public code.
// The real password lives in the gitignored .env file (or a real env var).
// This placeholder is only used if no .env is set up.
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'changeme';

// Stripe is optional. If a secret key is set in .env the real Stripe Checkout
// is used; otherwise the app falls back to a built-in "demo" checkout so the
// payment flow still works without an account. To connect a real Stripe
// account, just add STRIPE_SECRET_KEY to the .env file.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

// ─── STAFF AUTH ──────────────────────────────────────────────────────────────

/**
 * Check the staff password.
 * Expects: { password: "..." } and returns { success: true } if it matches.
 */
app.post('/api/staff/login', (req, res) => {
  const { password } = req.body;

  if (password === STAFF_PASSWORD) {
    return res.json({ success: true });
  }

  // 401 Unauthorised if the password is wrong
  res.status(401).json({ success: false, error: 'Incorrect password' });
});

// ─── STUDENT ROUTES ────────────────────────────────────────────────────────

/**
 * Look up a student by their school number.
 * Returns name and photo_url so the frontend can greet them by name.
 */
app.get('/api/student/:schoolNumber', (req, res) => {
  const student = db
    .prepare('SELECT * FROM students WHERE school_number = ?')
    .get(req.params.schoolNumber);

  if (!student) {
    // 404 if the school number doesn't match anyone in the database
    return res.status(404).json({ error: 'Student not found' });
  }

  res.json(student);
});

/**
 * Return every student, sorted alphabetically by name.
 * Used by the staff import page to preview who is in the database.
 */
app.get('/api/students', (req, res) => {
  const students = db
    .prepare('SELECT * FROM students ORDER BY name COLLATE NOCASE ASC')
    .all();
  res.json(students);
});

/**
 * Delete one or more students by school number.
 * Expects: { school_numbers: ["12345", "23456", ...] }
 * Returns how many rows were actually removed.
 */
app.post('/api/students/delete', (req, res) => {
  const { school_numbers } = req.body;

  // Must be a non-empty array
  if (!Array.isArray(school_numbers) || school_numbers.length === 0) {
    return res.status(400).json({ error: 'No students selected' });
  }

  const del = db.prepare('DELETE FROM students WHERE school_number = ?');

  // Delete each selected student and count how many were removed
  let deleted = 0;
  for (const schoolNumber of school_numbers) {
    const result = del.run(schoolNumber);
    deleted += result.changes;
  }

  res.json({ success: true, deleted });
});

/**
 * Import a list of students from an uploaded CSV file.
 *
 * The browser reads the file as plain text and sends it here as { csv: "..." }.
 * The server then parses, sorts, and inserts the rows so all the file-handling
 * logic lives in one place on the backend.
 *
 * Expected CSV columns (a header row is required): school_number, name, photo_url
 * The photo_url column is optional.
 */
app.post('/api/students/import', (req, res) => {
  const { csv } = req.body;

  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'No CSV data received' });
  }

  // Parse the raw CSV text into an array of student objects
  const parsed = parseStudentCsv(csv);

  if (parsed.rows.length === 0) {
    return res.status(400).json({
      error: 'No valid student rows found. Check the column headers.',
    });
  }

  // Sort alphabetically by name before inserting so the database fills in order
  parsed.rows.sort((a, b) => a.name.localeCompare(b.name));

  // INSERT OR IGNORE skips any school_number that already exists (UNIQUE column)
  // so re-uploading the same file doesn't crash — it just adds the new students.
  const insert = db.prepare(
    'INSERT OR IGNORE INTO students (school_number, name, photo_url) VALUES (?, ?, ?)'
  );

  // Keep the actual students in each bucket so the staff can see exactly
  // which ones were added and which were already in the database.
  const addedList = [];
  const skippedList = [];

  for (const student of parsed.rows) {
    const result = insert.run(student.school_number, student.name, student.photo_url);
    // changes === 1 means a row was actually inserted; 0 means it was ignored
    if (result.changes === 1) {
      addedList.push({ school_number: student.school_number, name: student.name });
    } else {
      skippedList.push({ school_number: student.school_number, name: student.name });
    }
  }

  res.json({
    success: true,
    added: addedList.length,
    skipped: skippedList.length,
    invalid: parsed.invalid.length,
    // Full detail lists so the frontend boxes can be expanded
    addedList,
    skippedList,        // already existed in the database
    invalidList: parsed.invalid, // rows missing a school number or name, with the reason
  });
});

/**
 * Parse raw CSV text into student rows.
 *
 * Returns { rows, invalid } where rows is the list of valid students and
 * invalid is an array describing each bad line: { line, content, reason }.
 */
function parseStudentCsv(csv) {
  // Split into lines and drop any blank ones (handles Windows \r\n too)
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return { rows: [], invalid: [] };

  // The first line is the header — work out which column is which
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const schoolIndex = headers.indexOf('school_number');
  const nameIndex = headers.indexOf('name');
  const photoIndex = headers.indexOf('photo_url');

  const rows = [];
  const invalid = [];

  // Loop over every line after the header
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map(c => c.trim());

    const schoolNumber = schoolIndex >= 0 ? cells[schoolIndex] : '';
    const name = nameIndex >= 0 ? cells[nameIndex] : '';
    const photoUrl = photoIndex >= 0 ? cells[photoIndex] : null;

    // A row is only valid if it has both a school number and a name.
    // Record exactly why a row failed so the staff can fix it.
    if (!schoolNumber && !name) {
      invalid.push({ line: i + 1, content: lines[i], reason: 'Missing school number and name' });
      continue;
    }
    if (!schoolNumber) {
      invalid.push({ line: i + 1, content: lines[i], reason: 'Missing school number' });
      continue;
    }
    if (!name) {
      invalid.push({ line: i + 1, content: lines[i], reason: 'Missing name' });
      continue;
    }

    rows.push({
      school_number: schoolNumber,
      name,
      photo_url: photoUrl || null,
    });
  }

  return { rows, invalid };
}

// ─── MENU ROUTES ───────────────────────────────────────────────────────────

/**
 * Return all menu items (both available and sold out), including daily limits.
 * The frontend handles showing sold-out items as faded with no controls.
 */
app.get('/api/menu', (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items').all();
  res.json(items);
});

/**
 * Add a new menu item. (Staff)
 * Expects: { name, price, available, daily_limit }
 */
app.post('/api/menu', (req, res) => {
  const { name, price, available, daily_limit } = req.body;

  if (!name || price == null || isNaN(price)) {
    return res.status(400).json({ error: 'A name and a valid price are required' });
  }

  const result = db
    .prepare('INSERT INTO menu_items (name, price, available, daily_limit) VALUES (?, ?, ?, ?)')
    .run(name, Number(price), available ? 1 : 0, Number(daily_limit) || 0);

  res.json({ success: true, id: result.lastInsertRowid });
});

/**
 * Update an existing menu item — price, name, availability or daily limit. (Staff)
 */
app.put('/api/menu/:id', (req, res) => {
  const { name, price, available, daily_limit } = req.body;

  if (!name || price == null || isNaN(price)) {
    return res.status(400).json({ error: 'A name and a valid price are required' });
  }

  db.prepare(
    'UPDATE menu_items SET name = ?, price = ?, available = ?, daily_limit = ? WHERE id = ?'
  ).run(name, Number(price), available ? 1 : 0, Number(daily_limit) || 0, req.params.id);

  res.json({ success: true });
});

/**
 * Delete a menu item. (Staff)
 */
app.delete('/api/menu/:id', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── ORDER ROUTES ──────────────────────────────────────────────────────────

/**
 * Generate a short, unique confirmation code (e.g. "K7QP2").
 * Ambiguous characters (0/O, 1/I/L) are left out so codes are easy to read aloud.
 */
function generateOrderCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Keep trying until we get a code not already used by another order
  } while (db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code));
  return code;
}

/**
 * Place a new order.
 * Expects: { school_number, break_time, items: [{id, name, price, quantity}], total }
 *
 * Enforces each item's daily limit, then stores the order with a unique
 * confirmation code which is returned for the student to show at the counter.
 */
app.post('/api/order', (req, res) => {
  const { school_number, break_time, items, total } = req.body;

  // Basic check that all required fields are present before writing to the database
  if (!school_number || !break_time || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  // ── Enforce per-item daily limits ──
  // Work out how many of each item this student has already ordered today
  // (ignoring cancelled orders).
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const todaysOrders = db
    .prepare(
      'SELECT items FROM orders WHERE school_number = ? AND cancelled = 0 AND substr(date, 1, 10) = ?'
    )
    .all(school_number, today);

  const alreadyToday = {}; // menu item id -> quantity ordered so far today
  for (const row of todaysOrders) {
    for (const it of JSON.parse(row.items)) {
      alreadyToday[it.id] = (alreadyToday[it.id] || 0) + it.quantity;
    }
  }

  // Look up the limit for every menu item, keyed by id
  const menuItems = db.prepare('SELECT id, name, daily_limit FROM menu_items').all();
  const menuById = {};
  menuItems.forEach(m => { menuById[m.id] = m; });

  // Check each item in the new order against its limit (0 = no limit)
  for (const item of items) {
    const menu = menuById[item.id];
    if (!menu || menu.daily_limit === 0) continue;

    const already = alreadyToday[item.id] || 0;
    if (already + item.quantity > menu.daily_limit) {
      return res.status(400).json({
        error:
          `Daily limit reached for ${menu.name} — max ${menu.daily_limit} per day` +
          (already > 0 ? ` (you already have ${already} today).` : '.'),
      });
    }
  }

  // ── Store the order with a unique confirmation code ──
  const code = generateOrderCode();
  const itemsJson = JSON.stringify(items);
  const date = new Date().toISOString();

  // TODO: add a cutoff time check here so orders can't be placed after school ends
  const result = db
    .prepare(
      'INSERT INTO orders (school_number, break_time, items, total, date, collected, code, cancelled) VALUES (?, ?, ?, ?, ?, 0, ?, 0)'
    )
    .run(school_number, break_time, itemsJson, total, date, code);

  // Return the code so the student can show it to the staff
  res.json({ success: true, orderId: result.lastInsertRowid, code });
});

/**
 * Get all orders — used by the staff dashboard.
 * Optional query param ?break=morning_tea or ?break=lunch to filter by break time.
 */
app.get('/api/orders', (req, res) => {
  const { break: breakTime } = req.query;

  let orders;
  if (breakTime && breakTime !== 'all') {
    // Filter by break time if a specific break was requested
    orders = db
      .prepare('SELECT * FROM orders WHERE break_time = ? ORDER BY date DESC')
      .all(breakTime);
  } else {
    orders = db.prepare('SELECT * FROM orders ORDER BY date DESC').all();
  }

  // Parse JSON and convert SQLite's 0/1 integers into real booleans
  orders = orders.map(order => ({
    ...order,
    items: JSON.parse(order.items),
    collected: order.collected === 1,
    cancelled: order.cancelled === 1,
    paid: order.paid === 1,
  }));

  res.json(orders);
});

/**
 * Look up a single order by its confirmation code. (Student status check)
 */
app.get('/api/order/:code', (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE code = ?')
    .get(req.params.code.toUpperCase());

  if (!order) {
    return res.status(404).json({ error: 'No order found with that code' });
  }

  res.json({
    ...order,
    items: JSON.parse(order.items),
    collected: order.collected === 1,
    cancelled: order.cancelled === 1,
    paid: order.paid === 1,
  });
});

/**
 * Mark an order as collected.
 * Called when the staff taps the "Collected" button on the dashboard.
 */
app.put('/api/orders/:id/collected', (req, res) => {
  db.prepare('UPDATE orders SET collected = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/**
 * Cancel an order from the staff dashboard.
 * Records that staff cancelled it so the student can be told who did.
 */
app.put('/api/orders/:id/cancel', (req, res) => {
  db.prepare("UPDATE orders SET cancelled = 1, cancelled_by = 'staff' WHERE id = ?")
    .run(req.params.id);
  res.json({ success: true });
});

/**
 * Cancel an order from the student side, using their confirmation code.
 * A collected order can't be cancelled.
 */
app.put('/api/order/:code/cancel', (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE code = ?')
    .get(req.params.code.toUpperCase());

  if (!order) {
    return res.status(404).json({ error: 'No order found with that code' });
  }
  if (order.collected === 1) {
    return res.status(400).json({ error: 'This order has already been collected and cannot be cancelled' });
  }
  if (order.cancelled === 1) {
    return res.status(400).json({ error: 'This order is already cancelled' });
  }

  db.prepare("UPDATE orders SET cancelled = 1, cancelled_by = 'student' WHERE id = ?")
    .run(order.id);
  res.json({ success: true });
});

// ─── PAYMENT ROUTES ──────────────────────────────────────────────────────────

/**
 * Start checkout for an order identified by its confirmation code.
 *
 * If a real Stripe key is configured, this creates a Stripe Checkout Session
 * and returns its URL for the browser to redirect to. If not, it returns
 * { demo: true } so the frontend can run the built-in demo payment instead.
 */
app.post('/api/checkout', async (req, res) => {
  const { code } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE code = ?').get((code || '').toUpperCase());

  if (!order) {
    return res.status(404).json({ error: 'No order found with that code' });
  }
  if (order.paid === 1) {
    return res.status(400).json({ error: 'This order is already paid' });
  }

  // No Stripe configured — tell the frontend to use the demo flow
  if (!stripe) {
    return res.json({ demo: true });
  }

  try {
    // Build Stripe line items from the order's items
    const items = JSON.parse(order.items);
    const lineItems = items.map(item => ({
      quantity: item.quantity,
      price_data: {
        currency: 'nzd',
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100), // Stripe works in cents
      },
    }));

    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      // On success Stripe redirects here, which marks the order paid
      success_url: `${origin}/api/payment-success?code=${order.code}`,
      cancel_url: `${origin}/payment.html?code=${order.code}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Could not start payment' });
  }
});

/**
 * Where Stripe redirects after a successful payment.
 * Marks the order paid and forwards the student to the success page.
 */
app.get('/api/payment-success', (req, res) => {
  const code = (req.query.code || '').toUpperCase();
  db.prepare('UPDATE orders SET paid = 1 WHERE code = ?').run(code);
  res.redirect(`/success.html?code=${code}`);
});

/**
 * Mark an order as paid via the built-in demo checkout (no real Stripe).
 */
app.post('/api/order/:code/pay', (req, res) => {
  const code = req.params.code.toUpperCase();
  const order = db.prepare('SELECT * FROM orders WHERE code = ?').get(code);

  if (!order) {
    return res.status(404).json({ error: 'No order found with that code' });
  }

  db.prepare('UPDATE orders SET paid = 1 WHERE code = ?').run(code);
  res.json({ success: true });
});

// ─── STUDENT HISTORY & DAILY ORDER ───────────────────────────────────────────

/**
 * All past orders for one student, newest first. (Student order history)
 */
app.get('/api/student/:schoolNumber/orders', (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE school_number = ? ORDER BY date DESC')
    .all(req.params.schoolNumber);

  res.json(orders.map(o => ({
    ...o,
    items: JSON.parse(o.items),
    collected: o.collected === 1,
    cancelled: o.cancelled === 1,
    paid: o.paid === 1,
  })));
});

/**
 * Check a saved daily order's items against the live menu.
 * Drops items staff have deleted and flags ones that are sold out, building a
 * list of notifications so the student knows what changed.
 */
function reconcileDaily(savedItems) {
  const menu = db.prepare('SELECT * FROM menu_items').all();
  const menuById = {};
  menu.forEach(m => { menuById[m.id] = m; });

  const items = [];
  const notifications = [];

  savedItems.forEach(si => {
    const m = menuById[si.id];
    if (!m) {
      // Staff removed this item from the menu entirely
      notifications.push(`${si.name} is no longer on the menu and was removed.`);
      return;
    }
    let status = 'ok';
    if (m.available !== 1) {
      status = 'sold_out';
      notifications.push(`${m.name} is currently unavailable.`);
    }
    // Use the current name/price in case staff changed them
    items.push({ id: m.id, name: m.name, price: m.price, quantity: si.quantity, status });
  });

  return { items, notifications };
}

/**
 * Get a student's saved daily order, reconciled against the current menu.
 */
app.get('/api/student/:schoolNumber/daily', (req, res) => {
  const row = db.prepare('SELECT * FROM daily_orders WHERE school_number = ?').get(req.params.schoolNumber);

  if (!row) {
    return res.json({ exists: false, break_time: 'morning_tea', items: [], notifications: [] });
  }

  const { items, notifications } = reconcileDaily(JSON.parse(row.items));
  res.json({ exists: true, break_time: row.break_time, items, notifications });
});

/**
 * Save (or update) a student's daily order.
 */
app.post('/api/student/:schoolNumber/daily', (req, res) => {
  const { break_time, items } = req.body;
  if (!break_time || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Missing break time or items' });
  }

  // Store only the fields we need
  const itemsJson = JSON.stringify(
    items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }))
  );

  // Upsert: one standing daily order per student
  db.prepare(`
    INSERT INTO daily_orders (school_number, break_time, items, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(school_number) DO UPDATE SET
      break_time = excluded.break_time,
      items = excluded.items,
      updated_at = excluded.updated_at
  `).run(req.params.schoolNumber, break_time, itemsJson, new Date().toISOString());

  res.json({ success: true });
});

/**
 * Place today's order from the saved daily order.
 * Sold-out or removed items are skipped and reported back so the student is
 * told which items were unavailable. If nothing is available, no order is made.
 */
app.post('/api/student/:schoolNumber/daily/place', (req, res) => {
  const sn = req.params.schoolNumber;
  const row = db.prepare('SELECT * FROM daily_orders WHERE school_number = ?').get(sn);
  if (!row) {
    return res.status(404).json({ error: 'No daily order saved yet' });
  }

  const { items } = reconcileDaily(JSON.parse(row.items));
  const available = items.filter(i => i.status === 'ok');
  const skipped = items.filter(i => i.status !== 'ok').map(i => i.name);

  // Nothing available — cancel the daily order for today and tell them why
  if (available.length === 0) {
    return res.json({
      placed: false,
      skipped,
      error: 'None of your daily items are available today, so no order was placed.',
    });
  }

  const orderItems = available.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }));
  const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const code = generateOrderCode();
  const date = new Date().toISOString();

  const result = db.prepare(
    'INSERT INTO orders (school_number, break_time, items, total, date, collected, code, cancelled, paid) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0)'
  ).run(sn, row.break_time, JSON.stringify(orderItems), total, date, code);

  res.json({ placed: true, orderId: result.lastInsertRowid, code, total, skipped });
});

// ─── STATS / ANALYTICS ROUTES ────────────────────────────────────────────────

/**
 * Aggregated sales stats for the staff analytics page.
 *
 * Query: ?days=30 (default 30, e.g. 30 / 45 / 90).
 * Returns, for the last N days:
 *   - daily: [{ date, count, revenue }]  one entry per day, zero-filled
 *   - items: [{ id, name }]              every item that sold in the range
 *   - series: { itemId: [{ date, revenue }] }  per-item daily revenue
 *
 * Cancelled orders are excluded since they aren't real sales.
 */
app.get('/api/stats', (req, res) => {
  // Clamp the range to something sensible (1–365 days)
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

  // Build a continuous list of date strings, oldest first
  const dates = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  const startDate = dates[0];

  // Pull every non-cancelled order from the range — these count as sales
  const orders = db
    .prepare('SELECT items, total, date FROM orders WHERE cancelled = 0 AND substr(date, 1, 10) >= ?')
    .all(startDate);

  // Prepare a zero-filled bucket for every day so the chart has no gaps
  const dailyMap = {};
  dates.forEach(d => { dailyMap[d] = { date: d, count: 0, revenue: 0 }; });

  const itemRevenue = {}; // itemId -> { date -> revenue }
  const itemNames = {};   // itemId -> name

  // Walk the orders and add each one to the right day and item buckets
  orders.forEach(order => {
    const day = order.date.slice(0, 10);
    if (!dailyMap[day]) return;

    dailyMap[day].count += 1;
    dailyMap[day].revenue += order.total;

    for (const it of JSON.parse(order.items)) {
      itemNames[it.id] = it.name;
      if (!itemRevenue[it.id]) itemRevenue[it.id] = {};
      itemRevenue[it.id][day] = (itemRevenue[it.id][day] || 0) + it.price * it.quantity;
    }
  });

  // Convert the day buckets into an ordered array
  const daily = dates.map(d => dailyMap[d]);

  // Include every current menu item too, so the dropdown always reflects the
  // live menu: a newly added item shows up even before it has any sales, and a
  // deleted item still keeps its past sales from the order history. Current
  // items use their current name (in case an item was renamed).
  const menuItems = db.prepare('SELECT id, name FROM menu_items').all();
  menuItems.forEach(m => { itemNames[m.id] = m.name; });

  // Build the item dropdown list and a continuous revenue series for each item
  const items = Object.keys(itemNames)
    .map(id => ({ id: Number(id), name: itemNames[id] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const series = {};
  items.forEach(it => {
    series[it.id] = dates.map(d => ({
      date: d,
      revenue: (itemRevenue[it.id] && itemRevenue[it.id][d]) || 0,
    }));
  });

  res.json({ days, dates, daily, items, series });
});

// ─── START SERVER ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Tuck Shop server running at http://localhost:${PORT}`);
  console.log('Student login: http://localhost:3000/login.html');
  console.log('Staff dashboard: http://localhost:3000/staff.html');
});
