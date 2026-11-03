# Fuzzy Sets Explorer

## The model

Each observation $x$ (a movie) has a membership $\mu_l(x) \in [0,1]$ in each set $A_l$ (a genre). Memberships are
independent: they need not sum to 1.

**Threshold.** For a threshold $\tau$, an observation belongs to every set its membership reaches (the $\alpha$-cut):

$$A_l^\tau = \{\, x : \mu_l(x) \ge \tau \,\}, \qquad \sigma(x) = \{\, l : \mu_l(x) \ge \tau \,\}$$

**Columns.** Each combination of sets $S$ is one column, holding the observations whose sets are exactly $S$:

$$R_S = \{\, x : \sigma(x) = S \,\}$$

Every observation is in exactly one column, or in no set at all.

**Strength.** How firmly $x$ belongs to all the sets of its column (the standard fuzzy intersection):

$$s(x) = \min_{l \in S} \mu_l(x)$$

**Column bars.**

$$n_S = |R_S| \quad \text{(outline)} \qquad F_S = \sum_{x \in R_S} s(x) \quad \text{(solid)}, \qquad \tau\, n_S \le F_S \le n_S$$

**Set bars.**

$$n_l = |A_l^\tau| \quad \text{(outline)} \qquad F_l = \sum_{x \in A_l^\tau} \mu_l(x) \quad \text{(solid)}$$

**Near a set.** An observation is near a set it almost reaches ($\beta = \tfrac12$ by default):

$$\beta\tau \le \mu_l(x) < \tau$$

See [docs/guide.md](docs/guide.md) for the full definitions.
