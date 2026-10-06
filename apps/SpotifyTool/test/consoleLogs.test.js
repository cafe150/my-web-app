const fs = require('fs');
const path = require('path');

describe('SpotifyTool Code Quality', () => {
  test('should not contain any leftover console.log statements in js files', () => {
    const jsDir = path.join(__dirname, '../js');
    const files = fs.readdirSync(jsDir).filter(file => file.endsWith('.js'));

    const consoleLogMatches = [];

    files.forEach(file => {
      const filePath = path.join(jsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Skip comment lines if any
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        if (line.includes('console.log(')) {
          consoleLogMatches.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    });

    expect(consoleLogMatches).toEqual([]);
  });
});
