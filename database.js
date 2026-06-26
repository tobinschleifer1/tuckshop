// database.js
// Sets up the SQLite database using Node's built-in node:sqlite module (Node 22.5+)
// Creates tables and seeds sample data on first run

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('tuckshop.db');

// Create tables if they don't already exist
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    photo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    available INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_number TEXT NOT NULL,
    break_time TEXT NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    date TEXT NOT NULL,
    collected INTEGER NOT NULL DEFAULT 0
  );
`);

/**
 * Add a column to a table only if it doesn't already exist.
 * Lets us upgrade an existing database without wiping the data inside it.
 */
function addColumnIfMissing(table, column, definition) {
  // pragma_table_info lists the existing columns of the table
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some(c => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migration: added ${table}.${column}`);
  }
}

// ── Migrations for the new features ──
// daily_limit: max of this item a student may order per day (0 = no limit)
addColumnIfMissing('menu_items', 'daily_limit', 'INTEGER NOT NULL DEFAULT 0');
// code: short confirmation code shown to the student and verified by staff
addColumnIfMissing('orders', 'code', 'TEXT');
// cancelled: 0 = active, 1 = cancelled
addColumnIfMissing('orders', 'cancelled', 'INTEGER NOT NULL DEFAULT 0');
// cancelled_by: who cancelled it ('student' or 'staff') — used to notify
addColumnIfMissing('orders', 'cancelled_by', 'TEXT');
// paid: 0 = awaiting payment, 1 = paid (via Stripe or demo checkout)
addColumnIfMissing('orders', 'paid', 'INTEGER NOT NULL DEFAULT 0');

// Seed students if the table is empty
const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get();
if (studentCount.count === 0) {
  const insertStudent = db.prepare(
    'INSERT INTO students (school_number, name, photo_url) VALUES (?, ?, ?)'
  );

  // Sample students for testing
  insertStudent.run('12345', 'James Tanner', null);
  insertStudent.run('23456', 'Liam Murphy', null);
  insertStudent.run('34567', 'Noah Fitzpatrick', null);
  insertStudent.run('45678', 'Oliver Ryan', null);
  insertStudent.run('56789', "Ethan O'Brien", null);

  console.log('Seeded students table');
}

// Seed menu items if the table is empty
const menuCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
if (menuCount.count === 0) {
  const insertItem = db.prepare(
    'INSERT INTO menu_items (name, price, available, daily_limit) VALUES (?, ?, ?, ?)'
  );

  // Menu items — available is 1/0, daily_limit is max per student per day (0 = no limit)
  insertItem.run('Meat Pie', 3.50, 1, 1);          // 1 pie per day
  insertItem.run('Sausage Roll', 3.00, 1, 2);
  insertItem.run('Ham Sandwich', 4.00, 1, 0);
  insertItem.run('Cheese & Vegemite Roll', 3.50, 1, 0);
  insertItem.run('Chicken Wrap', 5.00, 1, 1);
  insertItem.run('Hot Dog', 3.00, 1, 2);
  insertItem.run('Fruit Cup', 2.50, 1, 0);
  insertItem.run('Chocolate Milk', 2.00, 1, 0);
  insertItem.run('Water Bottle', 1.50, 1, 0);
  insertItem.run('Muesli Bar', 1.50, 0, 0); // sold out example

  console.log('Seeded menu_items table');
}

module.exports = db;
