const fs = require('fs');
const path = require('path');

describe('localStorage keys prefix check', () => {
    it('should not contain un-prefixed keys in guidance-pos HTML files', () => {
        const dir = path.join(__dirname, '../guidance-pos');
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

        files.forEach(file => {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]orders['"]\)/);
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]nextNum['"]\)/);
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]audioSettings['"]\)/);

            expect(content).toMatch(/localStorage\.(getItem|setItem)\(['"]queue_/);
        });
    });

    it('should not contain un-prefixed keys in food-pos HTML files', () => {
        const dir = path.join(__dirname, '../food-pos');
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

        files.forEach(file => {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]orders['"]\)/);
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]nextNum['"]\)/);
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]audioSettings['"]\)/);
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]masterData['"]\)/);
            expect(content).not.toMatch(/localStorage\.(getItem|setItem)\(['"]salesHistory['"]\)/);

            expect(content).toMatch(/localStorage\.(getItem|setItem)\(['"]food_/);
        });
    });
});
