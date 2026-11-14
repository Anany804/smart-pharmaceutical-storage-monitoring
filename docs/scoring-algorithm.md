# Medicine Storage Score

The score is an interpretable prototype indicator. It is **not** a substitute for product labeling, stability studies, calibration or regulatory controls. Set the ranges from the exact medicine and storage configuration before use.

## Default demonstration configuration

| Parameter | Acceptable range/threshold | Weight |
|---|---:|---:|
| Temperature | 15–25 °C | 45% |
| Relative humidity | 30–60% RH | 35% |
| Normalized light exposure | at most 30% | 20% |

Configure with `PHARMA_TEMP_MIN`, `PHARMA_TEMP_MAX`, `PHARMA_HUMIDITY_MIN`, `PHARMA_HUMIDITY_MAX`, and `PHARMA_LIGHT_MAX_PERCENT`. These values are exposed by `/api/health` and displayed in the dashboard.

## Component score formulas

Inside each inclusive acceptable range, temperature and humidity score 100. Outside, the score falls linearly with distance from the closest boundary:

```text
temperature_score = max(0, 100 - distance_outside_temperature_range / 5 °C × 100)
humidity_score    = max(0, 100 - distance_outside_humidity_range / 20 percentage-points × 100)
light_score       = 100                                      when light ≤ light_max
                  = max(0, 100 × (1 - (light-light_max)/(100-light_max))) otherwise
```

The tolerances 5 °C and 20 RH percentage points shape how quickly the display score falls; they do not define safe pharmaceutical storage limits. Component scores are rounded to two decimal places.

```text
overall = 0.45 × temperature_score
        + 0.35 × humidity_score
        + 0.20 × light_score
```

The weighted total is rounded to two decimals. Classifications are `Excellent` (≥90), `Good` (≥75), `Warning` (≥50), and `Critical` (<50). Any hard configured-range breach prevents a `Good`/`Excellent` result; a larger breach promotes the status to `Critical`. The independent alert severity remains visible even when other parameters produce a high weighted total.

## Missing and stale readings

Only validated readings are stored/scored. Invalid or missing fields produce an API error and an alert; they are never filled with a safe default. With no reading, or when a device exceeds its offline timeout, the current score is `Unavailable` and its components/overall score are null. Historical readings retain their stored score and classification.

## Alert boundaries

Temperature and humidity alerts fire immediately outside configured limits; larger excursions have critical severity. Light exposure above threshold creates a warning/critical alert based on how far over the configured maximum it is. Alert uniqueness is per device and condition while active. Recovery closes the active condition and records a separate `info` recovery event.
