# Blueprint: example and reconcile table

Reference for the "Plan from a spec" and "Reconcile a Blueprint with the code" sections of `SKILL.md`.

## From PRD to Blueprint

PRD fragment (`prd.md`):

> ## 2. Checkout
> Customers pay a cart. The API asks Stripe to charge and stores the order.
> ## 3. Data
> Orders belong to customers; an order has a status.

Blueprint (validates as is). The root Group `shop` already exists in the code, so only what the PRD adds is marked:

```
specification {
  node app      { description "A runnable app" icon server color green }
  node module   { description "A package or folder" icon box color blue }
  node external { description "A third-party service" icon cloud color gray }
  node table    { description "A database table" icon database color amber }
}
model {
  app api "API" { source { path "apps/api" } }
  module checkout "Checkout" "Charges a cart and stores the order. Assumption: one payment per order." planned {
    source { spec "prd.md#2-checkout" }
  }
  external stripe "Stripe" "Open question: are refunds in scope?" planned {
    source { spec "prd.md#2-checkout" }
  }
  table orders "Orders" planned {
    source { spec "prd.md#3-data" }
    id: uuid pk
    status: text "Open question: which states exist?"
  }
  api -> checkout "calls" planned
  checkout -> stripe "charges"
  interaction pay "Pay an order" "Spec: prd.md#2-checkout" planned {
    pay: api -> checkout "POST /pay"
    checkout -> stripe "charge"
    reply stripe -> checkout "ok"
    reply checkout -> api "201"
  }
}
view overview { type architecture include ** }
view pay { type sequence interaction pay order api, checkout, stripe }
view data { type er include orders }
```

- `checkout` and `stripe` are Nodes, so `checkout -> stripe` is drawn planned through its ends without its own mark; `api -> checkout` is marked to show the form.
- `api` is real (Source `path`), so it is not planned.
- A retiring element has no mark yet: leave it as it is and add `Open question: the spec retires this` to its description.

## Reconcile decisions

| Situation | Action |
| --- | --- |
| Planned Node and a unit of the draft that does the same job | Add `source { path "<unit id>" }`, remove `planned`; keep title, description, Edges and the `spec` ref |
| Planned table and a draft table with the same purpose | Same, with the table id; align the Attributes with the columns (`missing`, `extra`) and remove `planned` from the Attributes that exist |
| Planned Node with no counterpart in the draft | Keep `planned`; report as not built yet |
| Counterpart exists but differs from the plan (other name, other responsibility, other dependency) | Treat it as built (add the path, remove `planned`), write the difference as `Open question: diverges from the plan (<how>)` and list it in the report |
| `planned-with-path` warning | The mark is stale or the path points at the wrong thing: check, then apply the `fix` or remove the path |
| Planned Edge whose two ends are now real | Remove `planned` when the dependency shows in the draft's `dependencies`; keep it otherwise |
| Planned Interaction | Keep it planned until the user confirms the journey works; the draft does not describe journeys |
