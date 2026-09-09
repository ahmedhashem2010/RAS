// Shared result type for all server actions, previously defined inside
// the removed teams module. Kept in its own module so every action file
// imports the same type.
export type ActionResult = { ok: boolean; error?: string };