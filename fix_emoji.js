const fs = require('fs');

// Read the file
let content = fs.readFileSync('index.js', 'utf8');

// Fix all broken emojis
content = content.replace(/ğŸ'‹/g, '??');
content = content.replace(/ğŸ¯/g, '??');
content = content.replace(/ğŸ"Š/g, '??');
content = content.replace(/ğŸ'¸/g, '??');
content = content.replace(/ğŸ"/g, '??');
content = content.replace(/â"/g, '?');
content = content.replace(/ğŸ'°/g, '??');
content = content.replace(/ğŸ"ˆ/g, '??');
content = content.replace(/ğŸ'¡/g, '??');
content = content.replace(/ğŸ'¥/g, '??');
content = content.replace(/ğŸ'¤/g, '??');
content = content.replace(/ğŸ'§/g, '??');
content = content.replace(/ğŸ¨/g, '??');
content = content.replace(/ğŸ"‰/g, '??');
content = content.replace(/ğŸ"´/g, '??');
content = content.replace(/ğŸ"±/g, '??');
content = content.replace(/ğŸ"°/g, '??');
content = content.replace(/ğŸ"®/g, '??');
content = content.replace(/ğŸ"…/g, '??');

// Write the fixed file
fs.writeFileSync('index.js', content, 'utf8');
console.log('All broken emojis have been fixed!');