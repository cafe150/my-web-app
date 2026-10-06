const {
    detectOS,
    detectBrowserSync,
    detectEnvironment,
    detectEnvironmentAsync
} = require('../js/env-detector');

describe('EnvDetector Utility', () => {
    describe('detectOS', () => {
        it('detects Windows 10/11 64-bit', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
                platform: 'Win32'
            };
            const result = detectOS(nav);
            expect(result.osName).toBe('Windows 10/11');
            expect(result.bitness).toBe('64-bit');
        });

        it('detects macOS', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                platform: 'MacIntel'
            };
            const result = detectOS(nav);
            expect(result.osName).toBe('macOS');
        });

        it('detects iOS', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
                platform: 'iPhone'
            };
            const result = detectOS(nav);
            expect(result.osName).toBe('iOS');
        });

        it('detects Android', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36',
                platform: 'Linux armv8l'
            };
            const result = detectOS(nav);
            expect(result.osName).toBe('Android');
        });

        it('detects Linux 64-bit', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
                platform: 'Linux x86_64'
            };
            const result = detectOS(nav);
            expect(result.osName).toBe('Linux');
            expect(result.bitness).toBe('64-bit');
        });
    });

    describe('detectBrowserSync', () => {
        it('detects Brave when navigator.brave exists', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
                platform: 'Win32',
                brave: { isBrave: async () => true }
            };
            const result = detectBrowserSync(nav);
            expect(result.name).toBe('Brave');
            expect(result.chromiumVersion).toBe('154.0.0.0');
        });

        it('detects Chrome from userAgent', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                platform: 'Win32'
            };
            const result = detectBrowserSync(nav);
            expect(result.name).toBe('Chrome');
            expect(result.version).toBe('120.0.0.0');
        });

        it('detects Edge from userAgent', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133',
                platform: 'Win32'
            };
            const result = detectBrowserSync(nav);
            expect(result.name).toBe('Edge');
            expect(result.version).toBe('120.0.2210.133');
            expect(result.chromiumVersion).toBe('120.0.0.0');
        });

        it('detects Firefox', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
                platform: 'Win32'
            };
            const result = detectBrowserSync(nav);
            expect(result.name).toBe('Firefox');
            expect(result.version).toBe('123.0');
        });

        it('detects Safari', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
                platform: 'MacIntel'
            };
            const result = detectBrowserSync(nav);
            expect(result.name).toBe('Safari');
            expect(result.version).toBe('17.2.1');
        });
    });

    describe('detectEnvironment and detectEnvironmentAsync', () => {
        it('formats environment string for Brave synchronously', () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
                platform: 'Win32',
                brave: { isBrave: async () => true }
            };
            const envStr = detectEnvironment(nav);
            expect(envStr).toBe('Brave 154.0.0.0 (64-bit) / Windows 10/11');
        });

        it('formats detailed environment string asynchronously using getHighEntropyValues for Brave', async () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
                platform: 'Win32',
                brave: { isBrave: async () => true },
                userAgentData: {
                    getHighEntropyValues: async (hints) => ({
                        bitness: '64',
                        fullVersionList: [
                            { brand: 'Chromium', version: '154.0.8037.98' },
                            { brand: 'Brave', version: '1.96.61' }
                        ]
                    })
                }
            };
            const envStr = await detectEnvironmentAsync(nav);
            expect(envStr).toBe('Brave 1.96.61 (64-bit) Chromium: 154.0.8037.98 / Windows 10/11');
        });

        it('handles fallback gracefully when no high entropy values are present', async () => {
            const nav = {
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                platform: 'Linux x86_64'
            };
            const envStr = await detectEnvironmentAsync(nav);
            expect(envStr).toBe('Chrome 120.0.0.0 (64-bit) / Linux');
        });
    });
});
