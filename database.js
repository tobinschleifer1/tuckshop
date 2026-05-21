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
    'INSERT INTO menu_items (name, price, available) VALUES (?, ?, ?)'
  );

  // Menu items — available is 1 (true) or 0 (false)
  insertItem.run('Meat Pie', 3.50, 1);
  insertItem.run('Sausage Roll', 3.00, 1);
  insertItem.run('Ham Sandwich', 4.00, 1);
  insertItem.run('Cheese & Vegemite Roll', 3.50, 1);
  insertItem.run('Chicken Wrap', 5.00, 1);
  insertItem.run('Hot Dog', 3.00, 1);
  insertItem.run('Fruit Cup', 2.50, 1);
  insertItem.run('Chocolate Milk', 2.00, 1);
  insertItem.run('Water Bottle', 1.50, 1);
  insertItem.run('Muesli Bar', 1.50, 0); // sold out example

  console.log('Seeded menu_items table');
}

module.exports = db;
