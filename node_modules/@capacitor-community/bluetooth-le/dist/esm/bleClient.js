import { Capacitor } from '@capacitor/core';
import { dataViewToHexString, hexStringToDataView } from './conversion';
import { BluetoothLe } from './plugin';
import { getQueue } from './queue';
import { validateUUID } from './validators';
class BleClientClass {
    constructor() {
        this.scanListener = null;
        this.eventListeners = new Map();
        this.queue = getQueue(true);
    }
    enableQueue() {
        this.queue = getQueue(true);
    }
    disableQueue() {
        this.queue = getQueue(false);
    }
    async initialize(options) {
        await this.queue(async () => {
            await BluetoothLe.initialize(options);
        });
    }
    /**
     * Reports whether BLE is enabled on this device.
     * Always returns `true` on **web**.
     * @deprecated Use `isEnabled` instead.
     */
    async getEnabled() {
        return this.isEnabled();
    }
    async isEnabled() {
        const enabled = await this.queue(async () => {
            const result = await BluetoothLe.isEnabled();
            return result.value;
        });
        return enabled;
    }
    async enable() {
        await this.queue(async () => {
            await BluetoothLe.enable();
        });
    }
    async disable() {
        await this.queue(async () => {
            await BluetoothLe.disable();
        });
    }
    async startEnabledNotifications(callback) {
        await this.queue(async () => {
            var _a;
            const key = `onEnabledChanged`;
            await ((_a = this.eventListeners.get(key)) === null || _a === void 0 ? void 0 : _a.remove());
            const listener = await BluetoothLe.addListener(key, (result) => {
                callback(result.value);
            });
            this.eventListeners.set(key, listener);
            await BluetoothLe.startEnabledNotifications();
        });
    }
    async stopEnabledNotifications() {
        await this.queue(async () => {
            var _a;
            const key = `onEnabledChanged`;
            await ((_a = this.eventListeners.get(key)) === null || _a === void 0 ? void 0 : _a.remove());
            this.eventListeners.delete(key);
            await BluetoothLe.stopEnabledNotifications();
        });
    }
    async isLocationEnabled() {
        const enabled = await this.queue(async () => {
            const result = await BluetoothLe.isLocationEnabled();
            return result.value;
        });
        return enabled;
    }
    async openLocationSettings() {
        await this.queue(async () => {
            await BluetoothLe.openLocationSettings();
        });
    }
    async openBluetoothSettings() {
        await this.queue(async () => {
            await BluetoothLe.openBluetoothSettings();
        });
    }
    async openAppSettings() {
        await this.queue(async () => {
            await BluetoothLe.openAppSettings();
        });
    }
    async setDisplayStrings(displayStrings) {
        await this.queue(async () => {
            await BluetoothLe.setDisplayStrings(displayStrings);
        });
    }
    async requestDevice(options) {
        const result = await this.queue(async () => {
            const device = await BluetoothLe.requestDevice(options);
            return device;
        });
        return result;
    }
    async requestLEScan(options, callback) {
        await this.queue(async () => {
            var _a;
            await ((_a = this.scanListener) === null || _a === void 0 ? void 0 : _a.remove());
            this.scanListener = await BluetoothLe.addListener('onScanResult', (resultInternal) => {
                const result = Object.assign(Object.assign({}, resultInternal), { manufacturerData: this.convertObject(resultInternal.manufacturerData), serviceData: this.convertObject(resultInternal.serviceData), rawAdvertisement: resultInternal.rawAdvertisement
                        ? this.convertValue(resultInternal.rawAdvertisement)
                        : undefined });
                callback(result);
            });
            await BluetoothLe.requestLEScan(options);
        });
    }
    async stopLEScan() {
        await this.queue(async () => {
            var _a;
            await ((_a = this.scanListener) === null || _a === void 0 ? void 0 : _a.remove());
            this.scanListener = null;
            await BluetoothLe.stopLEScan();
        });
    }
    async getDevices(deviceIds) {
        return this.queue(async () => {
            const result = await BluetoothLe.getDevices({ deviceIds });
            return result.devices;
        });
    }
    async getConnectedDevices(services) {
        return this.queue(async () => {
            const result = await BluetoothLe.getConnectedDevices({ services });
            return result.devices;
        });
    }
    async connect(deviceId, onDisconnect, options) {
        await this.queue(async () => {
            var _a;
            if (onDisconnect) {
                const key = `disconnected|${deviceId}`;
                await ((_a = this.eventListeners.get(key)) === null || _a === void 0 ? void 0 : _a.remove());
                const listener = await BluetoothLe.addListener(key, () => {
                    onDisconnect(deviceId);
                });
                this.eventListeners.set(key, listener);
            }
            await BluetoothLe.connect(Object.assign({ deviceId }, options));
        });
    }
    async createBond(deviceId) {
        await this.queue(async () => {
            await BluetoothLe.createBond({ deviceId });
        });
    }
    async isBonded(deviceId) {
        const isBonded = await this.queue(async () => {
            const result = await BluetoothLe.isBonded({ deviceId });
            return result.value;
        });
        return isBonded;
    }
    async disconnect(deviceId) {
        await this.queue(async () => {
            await BluetoothLe.disconnect({ deviceId });
        });
    }
    async getServices(deviceId) {
        const services = await this.queue(async () => {
            const result = await BluetoothLe.getServices({ deviceId });
            return result.services;
        });
        return services;
    }
    async readRssi(deviceId) {
        const value = await this.queue(async () => {
            const result = await BluetoothLe.readRssi({ deviceId });
            return parseFloat(result.value);
        });
        return value;
    }
    async read(deviceId, service, characteristic, options) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        const value = await this.queue(async () => {
            const result = await BluetoothLe.read(Object.assign({ deviceId,
                service,
                characteristic }, options));
            return this.convertValue(result.value);
        });
        return value;
    }
    async write(deviceId, service, characteristic, value, options) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        return this.queue(async () => {
            if (!(value === null || value === void 0 ? void 0 : value.buffer)) {
                throw new Error('Invalid data.');
            }
            let writeValue = value;
            if (Capacitor.getPlatform() !== 'web') {
                // on native we can only write strings
                writeValue = dataViewToHexString(value);
            }
            await BluetoothLe.write(Object.assign({ deviceId,
                service,
                characteristic, value: writeValue }, options));
        });
    }
    async writeWithoutResponse(deviceId, service, characteristic, value, options) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        await this.queue(async () => {
            if (!(value === null || value === void 0 ? void 0 : value.buffer)) {
                throw new Error('Invalid data.');
            }
            let writeValue = value;
            if (Capacitor.getPlatform() !== 'web') {
                // on native we can only write strings
                writeValue = dataViewToHexString(value);
            }
            await BluetoothLe.writeWithoutResponse(Object.assign({ deviceId,
                service,
                characteristic, value: writeValue }, options));
        });
    }
    async readDescriptor(deviceId, service, characteristic, descriptor, options) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        descriptor = validateUUID(descriptor);
        const value = await this.queue(async () => {
            const result = await BluetoothLe.readDescriptor(Object.assign({ deviceId,
                service,
                characteristic,
                descriptor }, options));
            return this.convertValue(result.value);
        });
        return value;
    }
    async writeDescriptor(deviceId, service, characteristic, descriptor, value, options) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        descriptor = validateUUID(descriptor);
        return this.queue(async () => {
            if (!(value === null || value === void 0 ? void 0 : value.buffer)) {
                throw new Error('Invalid data.');
            }
            let writeValue = value;
            if (Capacitor.getPlatform() !== 'web') {
                // on native we can only write strings
                writeValue = dataViewToHexString(value);
            }
            await BluetoothLe.writeDescriptor(Object.assign({ deviceId,
                service,
                characteristic,
                descriptor, value: writeValue }, options));
        });
    }
    async startNotifications(deviceId, service, characteristic, callback) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        await this.queue(async () => {
            var _a;
            const key = `notification|${deviceId}|${service}|${characteristic}`;
            await ((_a = this.eventListeners.get(key)) === null || _a === void 0 ? void 0 : _a.remove());
            const listener = await BluetoothLe.addListener(key, (event) => {
                callback(this.convertValue(event === null || event === void 0 ? void 0 : event.value));
            });
            this.eventListeners.set(key, listener);
            await BluetoothLe.startNotifications({
                deviceId,
                service,
                characteristic,
            });
        });
    }
    async stopNotifications(deviceId, service, characteristic) {
        service = validateUUID(service);
        characteristic = validateUUID(characteristic);
        await this.queue(async () => {
            var _a;
            const key = `notification|${deviceId}|${service}|${characteristic}`;
            await ((_a = this.eventListeners.get(key)) === null || _a === void 0 ? void 0 : _a.remove());
            this.eventListeners.delete(key);
            await BluetoothLe.stopNotifications({
                deviceId,
                service,
                characteristic,
            });
        });
    }
    convertValue(value) {
        if (typeof value === 'string') {
            return hexStringToDataView(value);
        }
        else if (value === undefined) {
            return new DataView(new ArrayBuffer(0));
        }
        return value;
    }
    convertObject(obj) {
        if (obj === undefined) {
            return undefined;
        }
        const result = {};
        for (const key of Object.keys(obj)) {
            result[key] = this.convertValue(obj[key]);
        }
        return result;
    }
}
export const BleClient = new BleClientClass();
//# sourceMappingURL=bleClient.js.map