# Row-lock order for posting operations

Every posting operation (`post_sale`, `post_receipt`, `post_return`, `close_shift`,
`confirm_order`, `dispatch_transfer`/`receive_transfer`, `post_adjustment`) runs inside one
`transaction.atomic()` and takes `SELECT … FOR UPDATE` locks **in this order only**.
Taking them in a fixed order is what makes concurrent postings deadlock-free.

1. **The document being posted** (receipt, sale, return, …) — `select_for_update()` on its
   header row, then re-check its status (draft → posted happens once).
2. **Idempotency record** for the request key (`apps/sync` — created or read under the same
   transaction), then the **document number sequence** (`apps/sync.next_number`) if the
   posting assigns a number.
3. **Stock balances**, via `inventory.services.stock.lock_balances(...)`: one statement that
   locks every `(location, batch)` row the operation touches, ordered by
   `(branch_id, item_id, batch_id, location_id)`. Missing rows are created first
   (`INSERT … ON CONFLICT DO NOTHING`) so they can be locked too.
4. **Reservations** (`orders`) for the same items, ordered by `(item_id, id)`.
5. **Party balances** (customer / supplier ledgers in `finance`), ordered by party id.
6. **Shift / cash register** row last.

Rules:

- Never lock a balance row for item B and then go back for item A < B. Collect every
  touched `(location, batch)` first, then call `lock_balances` once.
- Never read-modify-write a balance without its lock: `apply_movement` asserts the row was
  locked in this transaction.
- The movement log is the source of truth; `StockBalance.quantity_base` is a summary kept
  in the same transaction, with `CHECK (quantity_base >= 0)` as the last line of defence.
- Concurrency tests use two real database connections (threads + `transaction=True`).
