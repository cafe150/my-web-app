// Mock localStorage
function createMockLocalStorage() {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, val) => { store[key] = String(val); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        _getStore: () => store
    };
}

describe('Guidance POS tests', () => {
    it('Default expMaster fallback is consistent across admin, caller, display, and settings logic', () => {
        const localStorage = createMockLocalStorage();

        let adminExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
        if (typeof adminExps[0] === 'string') adminExps = adminExps.map(e => ({name: e, duration: 5}));

        let callerExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
        if (typeof callerExps[0] === 'string') callerExps = callerExps.map(e => ({name: e, duration: 5}));

        let displayExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
        if (typeof displayExps[0] === 'string') displayExps = displayExps.map(e => ({name: e, duration: 5}));

        let settingsRawExp = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
        if (settingsRawExp.length > 0 && typeof settingsRawExp[0] === 'string') settingsRawExp = settingsRawExp.map(e => ({ name: e, duration: 5 }));

        expect(adminExps).toEqual(callerExps);
        expect(callerExps).toEqual(displayExps);
        expect(displayExps).toEqual(settingsRawExp);
        expect(adminExps[0].name).toBe('体験');
    });

    it('Ticket issued with default expMaster ("体験") appears in caller.html target orders', () => {
        const localStorage = createMockLocalStorage();

        let adminExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
        const selectedExps = [adminExps[0].name];

        let orders = JSON.parse(localStorage.getItem('orders') || '[]');
        let nextNum = parseInt(localStorage.getItem('nextNum') || '1');

        orders.push({
            id: Date.now(),
            number: nextNum,
            name: 'ヤマダ',
            pax: '1',
            time: '指定なし',
            manualWait: null,
            experiences: selectedExps,
            status: 'waiting'
        });
        localStorage.setItem('orders', JSON.stringify(orders));

        let callerExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
        let savedOrders = JSON.parse(localStorage.getItem('orders') || '[]');

        let matchedInColumn = false;
        callerExps.forEach(exp => {
            const targetOrders = savedOrders.filter(o => o.experiences && o.experiences.includes(exp.name));
            if (targetOrders.some(o => o.number === 1)) {
                matchedInColumn = true;
            }
        });

        expect(matchedInColumn).toBe(true);
    });

    it('Ticket with unmatched experience name is caught in fallback "noExpOrders" section', () => {
        const localStorage = createMockLocalStorage();

        const savedOrders = [{
            id: 12345,
            number: 99,
            name: 'スズキ',
            pax: '2',
            time: '指定なし',
            manualWait: null,
            experiences: ['古体験'],
            status: 'waiting'
        }];
        localStorage.setItem('orders', JSON.stringify(savedOrders));

        localStorage.setItem('expMaster', JSON.stringify([{name: "新体験", duration: 10}]));
        let callerExps = JSON.parse(localStorage.getItem('expMaster'));

        const expNames = callerExps.map(e => e.name);
        const noExpOrders = savedOrders.filter(o => !o.experiences || o.experiences.length === 0 || !o.experiences.some(exp => expNames.includes(exp)));

        expect(noExpOrders.length).toBe(1);
        expect(noExpOrders[0].number).toBe(99);
    });
});
