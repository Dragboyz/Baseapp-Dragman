const fs = require('fs');

// Read the file
let content = fs.readFileSync('index.js', 'utf8');

// Fix all broken emojis
content = content.replace(/�'�/g, '??');
content = content.replace(/🎯/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�'�/g, '??');
content = content.replace(/�"/g, '??');
content = content.replace(/�"/g, '?');
content = content.replace(/�'�/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�'�/g, '??');
content = content.replace(/�'�/g, '??');
content = content.replace(/�'�/g, '??');
content = content.replace(/�'�/g, '??');
content = content.replace(/🎨/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�"�/g, '??');
content = content.replace(/�"�/g, '??');

// Write the fixed file
fs.writeFileSync('index.js', content, 'utf8');
console.log('All broken emojis have been fixed!');