/**
 * Convert an array of numbers into a DataView.
 */
export declare function numbersToDataView(value: number[]): DataView;
/**
 * Convert a DataView into an array of numbers.
 */
export declare function dataViewToNumbers(value: DataView): number[];
/**
 * Convert a string into a DataView.
 */
export declare function textToDataView(value: string): DataView;
/**
 * Convert a DataView into a string.
 */
export declare function dataViewToText(value: DataView): string;
/**
 * Convert a 16 bit UUID into a 128 bit UUID string
 * @param value number, e.g. 0x180d
 * @return string, e.g. '0000180d-0000-1000-8000-00805f9b34fb'
 */
export declare function numberToUUID(value: number): string;
export declare function hexStringToDataView(value: string): DataView;
export declare function dataViewToHexString(value: DataView): string;
export declare function webUUIDToString(uuid: string | number): string;
export declare function mapToObject<V>(map?: Map<string | number, V>): {
    [key: string]: V;
} | undefined;
