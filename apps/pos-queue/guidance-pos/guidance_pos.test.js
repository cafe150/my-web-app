const test = require('node:test');
const assert = require('node:assert');

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

test('Default expMaster fallback is consistent across admin, caller, display, and settings logic', () => {
    const localStorage = createMockLocalStorage();

    // Simulation of admin.html loadExps
    let adminExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
    if (typeof adminExps[0] === 'string') adminExps = adminExps.map(e => ({name: e, duration: 5}));

    // Simulation of caller.html renderCaller exps loading
    let callerExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
    if (typeof callerExps[0] === 'string') callerExps = callerExps.map(e => ({name: e, duration: 5}));

    // Simulation of display.html updateWaitingList exps loading
    let displayExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
    if (typeof displayExps[0] === 'string') displayExps = displayExps.map(e => ({name: e, duration: 5}));

    // Simulation of settings.html rawExp loading
    let settingsRawExp = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
    if (settingsRawExp.length > 0 && typeof settingsRawExp[0] === 'string') settingsRawExp = settingsRawExp.map(e => ({ name: e, duration: 5 }));

    assert.deepStrictEqual(adminExps, callerExps);
    assert.deepStrictEqual(callerExps, displayExps);
    assert.deepStrictEqual(displayExps, settingsRawExp);
    assert.strictEqual(adminExps[0].name, '体験');
});

test('Ticket issued with default expMaster ("体験") appears in caller.html target orders', () => {
    const localStorage = createMockLocalStorage();

    // 1. Issue a ticket on admin.html with default expMaster
    let adminExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
    const selectedExps = [adminExps[0].name]; // ["体験"]

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

    // 2. Caller.html processes orders with default expMaster
    let callerExps = JSON.parse(localStorage.getItem('expMaster')) || [{name: "体験", duration: 5}];
    let savedOrders = JSON.parse(localStorage.getItem('orders') || '[]');

    let matchedInColumn = false;
    callerExps.forEach(exp => {
        const targetOrders = savedOrders.filter(o => o.experiences && o.experiences.includes(exp.name));
        if (targetOrders.some(o => o.number === 1)) {
            matchedInColumn = true;
        }
    });

    assert.strictEqual(matchedInColumn, true, 'Issued ticket should match the caller column under default settings');
});

test('Ticket with unmatched experience name is caught in fallback "noExpOrders" section', () => {
    const localStorage = createMockLocalStorage();

    // Ticket issued under an old experience name "古体験"
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

    // Caller.html loaded with new expMaster ["新体験"]
    localStorage.setItem('expMaster', JSON.stringify([{name: "新体験", duration: 10}]));
    let callerExps = JSON.parse(localStorage.getItem('expMaster'));

    const expNames = callerExps.map(e => e.name);
    const noExpOrders = savedOrders.filter(o => !o.experiences || o.experiences.length === 0 || !o.experiences.some(exp => expNames.includes(exp)));

    assert.strictEqual(noExpOrders.length, 1);
    assert.strictEqual(noExpOrders[0].number, 99, 'Unmatched experience ticket should appear in fallback section');
});
