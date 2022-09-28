/**
 * Android scan mode
 */
export var ScanMode;
(function (ScanMode) {
    /**
     * Perform Bluetooth LE scan in low power mode. This mode is enforced if the scanning application is not in foreground.
     * https://developer.android.com/reference/android/bluetooth/le/ScanSettings#SCAN_MODE_LOW_POWER
     */
    ScanMode[ScanMode["SCAN_MODE_LOW_POWER"] = 0] = "SCAN_MODE_LOW_POWER";
    /**
     * Perform Bluetooth LE scan in balanced power mode. (default) Scan results are returned at a rate that provides a good trade-off between scan frequency and power consumption.
     * https://developer.android.com/reference/android/bluetooth/le/ScanSettings#SCAN_MODE_BALANCED
     */
    ScanMode[ScanMode["SCAN_MODE_BALANCED"] = 1] = "SCAN_MODE_BALANCED";
    /**
     * Scan using highest duty cycle. It's recommended to only use this mode when the application is running in the foreground.
     * https://developer.android.com/reference/android/bluetooth/le/ScanSettings#SCAN_MODE_LOW_LATENCY
     */
    ScanMode[ScanMode["SCAN_MODE_LOW_LATENCY"] = 2] = "SCAN_MODE_LOW_LATENCY";
})(ScanMode || (ScanMode = {}));
//# sourceMappingURL=definitions.js.map