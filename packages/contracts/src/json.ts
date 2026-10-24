/**
 * JSON-safe value types.
 *
 * The wire contract must not admit values that survive TypeScript but not
 * `JSON.stringify`: `BigInt` throws, `Date` silently becomes a string, functions and
 * `undefined` vanish from objects. Since telemetry must never throw into the host
 * application, the type forbids at compile time what would otherwise fail at runtime.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
