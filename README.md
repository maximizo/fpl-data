# fpl-data

Data feed for the [FPL Draft dashboard](https://zoryaanalytics.com/fpldraft/).

A GitHub Action fetches public data from the FPL Draft API every ~5 minutes
during the season and force-pushes a single-commit snapshot to the `data`
branch. The dashboard reads it from
`https://raw.githubusercontent.com/maximizo/fpl-data/data/snapshot.json`
because the FPL API does not allow cross-origin browser requests.

Contains only public FPL Draft league data.
