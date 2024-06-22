import { EventEmitter } from 'events';

export default class EventBus {
	private static singleton: EventEmitter;

	static GetSingleton() {
		if(!this.singleton)
			this.singleton = new EventEmitter();

		return this.singleton;
	}
}