import { EventEmitter } from 'events';
export default class EventBus {
    static singleton;
    static GetSingleton() {
        if (!this.singleton)
            this.singleton = new EventEmitter();
        return this.singleton;
    }
}
//# sourceMappingURL=EventBus.js.map