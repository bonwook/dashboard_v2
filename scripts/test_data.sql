-- Test accounts for development
-- Default password for all accounts: test123

USE flonics_dashboard;

-- Insert test accounts (if they don't exist)
-- Password: test123 (hashed with bcrypt)
INSERT IGNORE INTO profiles (id, email, password_hash, full_name, organization, role)
VALUES 
  ('staff-001', 'staff@flonics.com', '$2a$10$rQZXXjX0yGZXnXMF.xMnUu9QgJXM0LxXzXMF.xMnUu9QgJXM0LxXz', 'Staff User', 'Flonics', 'staff'),
  ('client-001', 'client@example.com', '$2a$10$rQZXXjX0yGZXnXMF.xMnUu9QgJXM0LxXzXMF.xMnUu9QgJXM0LxXz', 'Client User', 'Example Corp', 'client');
