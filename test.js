const fs = require('fs');

const files = ['index.html', 'script.js', 'style.css'];

files.forEach(file => {
    if (!fs.existsSync(file)) {
        throw new Error(`${file} is missing`);
    }
});

console.log('All tests passed!');
