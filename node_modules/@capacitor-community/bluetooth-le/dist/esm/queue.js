import throat from 'throat';
export function getQueue(enabled) {
    if (enabled) {
        return throat(1);
    }
    else {
        return (fn) => fn();
    }
}
//# sourceMappingURL=queue.js.map