import type { DisplayStrings } from './config';
import type { BleDevice, BleService, InitializeOptions, RequestBleDeviceOptions, ScanResult, TimeoutOptions } from './definitions';
export interface BleClientInterface {
    /**
     * Initialize Bluetooth Low Energy (BLE). If it fails, BLE might be unavailable on this device.
     * On **Android** it will ask for the location permission. On **iOS** it will ask for the Bluetooth permission.
     * For an example, see [usage](#usage).
     */
    initialize(options?: InitializeOptions): Promise<void>;
    /**
     * Reports whether Bluetooth is enabled on this device.
     * Always returns `true` on **web**.
     */
    isEnabled(): Promise<boolean>;
    /**
     * Enable Bluetooth.
     * Only available on **Android**.
     */
    enable(): Promise<void>;
    /**
     * Disable Bluetooth.
     * Only available on **Android**.
     */
    disable(): Promise<void>;
    /**
     * Register a callback function that will be invoked when Bluetooth is enabled (true) or disabled (false) on this device.
     * Not available on **web** (the callback will never be invoked).
     * @param callback Callback function to use when the Bluetooth state changes.
     */
    startEnabledNotifications(callback: (value: boolean) => void): Promise<void>;
    /**
     * Stop the enabled notifications registered with `startEnabledNotifications`.
     */
    stopEnabledNotifications(): Promise<void>;
    /**
     * Reports whether Location Services are enabled on this device.
     * Only available on **Android**.
     */
    isLocationEnabled(): Promise<boolean>;
    /**
     * Open Location settings.
     * Only available on **Android**.
     */
    openLocationSettings(): Promise<void>;
    /**
     * Open Bluetooth settings.
     * Only available on **Android**.
     */
    openBluetoothSettings(): Promise<void>;
    /**
     * Open App settings.
     * Not available on **web**.
     * On **iOS** when a user declines the request to use Bluetooth on the first call of `initialize`, it is not possible
     * to request for Bluetooth again from within the app. In this case Bluetooth has to be enabled in the app settings
     * for the app to be able use it.
     */
    openAppSettings(): Promise<void>;
    /**
     * Set the strings that are displayed in the `requestDevice` dialog.
     * @param displayStrings
     */
    setDisplayStrings(displayStrings: DisplayStrings): Promise<void>;
    /**
     * Request a peripheral BLE device to interact with. This will scan for available devices according to the filters in the options and show a dialog to pick a device.
     * For an example, see [usage](#usage).
     * @param options Device filters, see [RequestBleDeviceOptions](#RequestBleDeviceOptions)
     */
    requestDevice(options?: RequestBleDeviceOptions): Promise<BleDevice>;
    /**
     * Start scanning for BLE devices to interact with according to the filters in the options. The callback will be invoked on each device that is found.
     * Scanning will continue until `stopLEScan` is called. For an example, see [usage](#usage).
     * **NOTE**: Use with care on **web** platform, the required API is still behind a flag in most browsers.
     * @param options
     * @param callback
     */
    requestLEScan(options: RequestBleDeviceOptions, callback: (result: ScanResult) => void): Promise<void>;
    /**
     * Stop scanning for BLE devices. For an example, see [usage](#usage).
     */
    stopLEScan(): Promise<void>;
    /**
     * On iOS and web, if you want to connect to a previously connected device without scanning first, you can use `getDevice`.
     * Uses [retrievePeripherals](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/1519127-retrieveperipherals) on iOS and
     * [getDevices](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices) on web.
     * On Android, you can directly connect to the device with the deviceId.
     * @param deviceIds List of device IDs, e.g. saved from a previous app run. No used on web.
     */
    getDevices(deviceIds: string[]): Promise<BleDevice[]>;
    /**
     * Get a list of currently connected devices.
     * Uses [retrieveConnectedPeripherals](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/1518924-retrieveconnectedperipherals) on iOS,
     * [getConnectedDevices](https://developer.android.com/reference/android/bluetooth/BluetoothManager#getConnectedDevices(int)) on Android
     * and [getDevices](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices) on web.
     * @param services List of services to filter the devices by. If no service is specified, no devices will be returned. Only applies to iOS.
     */
    getConnectedDevices(services: string[]): Promise<BleDevice[]>;
    /**
     * Connect to a peripheral BLE device. For an example, see [usage](#usage).
     * @param deviceId  The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param onDisconnect Optional disconnect callback function that will be used when the device disconnects
     * @param options Options for plugin call
     */
    connect(deviceId: string, onDisconnect?: (deviceId: string) => void, options?: TimeoutOptions): Promise<void>;
    /**
     * Create a bond with a peripheral BLE device.
     * Only available on **Android**. On iOS bonding is handled by the OS.
     * @param deviceId  The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     */
    createBond(deviceId: string): Promise<void>;
    /**
     * Report whether a peripheral BLE device is bonded.
     * Only available on **Android**. On iOS bonding is handled by the OS.
     * @param deviceId  The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     */
    isBonded(deviceId: string): Promise<boolean>;
    /**
     * Disconnect from a peripheral BLE device. For an example, see [usage](#usage).
     * @param deviceId  The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     */
    disconnect(deviceId: string): Promise<void>;
    /**
     * Get services, characteristics and descriptors of a device.
     * @param deviceId  The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     */
    getServices(deviceId: string): Promise<BleService[]>;
    /**
     * Read the RSSI value of a connected device.
     * Not available on web.
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     */
    readRssi(deviceId: string): Promise<number>;
    /**
     * Read the value of a characteristic. For an example, see [usage](#usage).
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     * @param options Options for plugin call
     */
    read(deviceId: string, service: string, characteristic: string, options?: TimeoutOptions): Promise<DataView>;
    /**
     * Write a value to a characteristic. For an example, see [usage](#usage).
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     * @param value The value to write as a DataView. To create a DataView from an array of numbers, there is a helper function, e.g. numbersToDataView([1, 0])
     * @param options Options for plugin call
     */
    write(deviceId: string, service: string, characteristic: string, value: DataView, options?: TimeoutOptions): Promise<void>;
    /**
     * Write a value to a characteristic without waiting for a response.
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     * @param value The value to write as a DataView. To create a DataView from an array of numbers, there is a helper function, e.g. numbersToDataView([1, 0])
     * @param options Options for plugin call
     */
    writeWithoutResponse(deviceId: string, service: string, characteristic: string, value: DataView, options?: TimeoutOptions): Promise<void>;
    /**
     * Read the value of a descriptor.
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     * @param descriptor UUID of the descriptor (see [UUID format](#uuid-format))
     * @param options Options for plugin call
     */
    readDescriptor(deviceId: string, service: string, characteristic: string, descriptor: string, options?: TimeoutOptions): Promise<DataView>;
    /**
     * Write a value to a descriptor.
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     * @param descriptor UUID of the descriptor (see [UUID format](#uuid-format))
     * @param value The value to write as a DataView. To create a DataView from an array of numbers, there is a helper function, e.g. numbersToDataView([1, 0])
     * @param options Options for plugin call
     */
    writeDescriptor(deviceId: string, service: string, characteristic: string, descriptor: string, value: DataView, options?: TimeoutOptions): Promise<void>;
    /**
     * Start listening to changes of the value of a characteristic.
     * Note that you should only start the notifications once per characteristic in your app and share the data and
     * not call `startNotifications` in every component that needs the data.
     * For an example, see [usage](#usage).
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     * @param callback Callback function to use when the value of the characteristic changes
     */
    startNotifications(deviceId: string, service: string, characteristic: string, callback: (value: DataView) => void): Promise<void>;
    /**
     * Stop listening to the changes of the value of a characteristic. For an example, see [usage](#usage).
     * @param deviceId The ID of the device to use (obtained from [requestDevice](#requestDevice) or [requestLEScan](#requestLEScan))
     * @param service UUID of the service (see [UUID format](#uuid-format))
     * @param characteristic UUID of the characteristic (see [UUID format](#uuid-format))
     */
    stopNotifications(deviceId: string, service: string, characteristic: string): Promise<void>;
}
declare class BleClientClass implements BleClientInterface {
    private scanListener;
    private eventListeners;
    private queue;
    enableQueue(): void;
    disableQueue(): void;
    initialize(options?: InitializeOptions): Promise<void>;
    /**
     * Reports whether BLE is enabled on this device.
     * Always returns `true` on **web**.
     * @deprecated Use `isEnabled` instead.
     */
    getEnabled(): Promise<boolean>;
    isEnabled(): Promise<boolean>;
    enable(): Promise<void>;
    disable(): Promise<void>;
    startEnabledNotifications(callback: (value: boolean) => void): Promise<void>;
    stopEnabledNotifications(): Promise<void>;
    isLocationEnabled(): Promise<boolean>;
    openLocationSettings(): Promise<void>;
    openBluetoothSettings(): Promise<void>;
    openAppSettings(): Promise<void>;
    setDisplayStrings(displayStrings: DisplayStrings): Promise<void>;
    requestDevice(options?: RequestBleDeviceOptions): Promise<BleDevice>;
    requestLEScan(options: RequestBleDeviceOptions, callback: (result: ScanResult) => void): Promise<void>;
    stopLEScan(): Promise<void>;
    getDevices(deviceIds: string[]): Promise<BleDevice[]>;
    getConnectedDevices(services: string[]): Promise<BleDevice[]>;
    connect(deviceId: string, onDisconnect?: (deviceId: string) => void, options?: TimeoutOptions): Promise<void>;
    createBond(deviceId: string): Promise<void>;
    isBonded(deviceId: string): Promise<boolean>;
    disconnect(deviceId: string): Promise<void>;
    getServices(deviceId: string): Promise<BleService[]>;
    readRssi(deviceId: string): Promise<number>;
    read(deviceId: string, service: string, characteristic: string, options?: TimeoutOptions): Promise<DataView>;
    write(deviceId: string, service: string, characteristic: string, value: DataView, options?: TimeoutOptions): Promise<void>;
    writeWithoutResponse(deviceId: string, service: string, characteristic: string, value: DataView, options?: TimeoutOptions): Promise<void>;
    readDescriptor(deviceId: string, service: string, characteristic: string, descriptor: string, options?: TimeoutOptions): Promise<DataView>;
    writeDescriptor(deviceId: string, service: string, characteristic: string, descriptor: string, value: DataView, options?: TimeoutOptions): Promise<void>;
    startNotifications(deviceId: string, service: string, characteristic: string, callback: (value: DataView) => void): Promise<void>;
    stopNotifications(deviceId: string, service: string, characteristic: string): Promise<void>;
    private convertValue;
    private convertObject;
}
export declare const BleClient: BleClientClass;
export {};
