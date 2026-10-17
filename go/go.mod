// The module path must match the repository that serves it: the SDK mirror at
// github.com/Misar-AI/misarpost-sdks keeps each language in a subdirectory, so
// this module lives at the /go suffix and its release tags are `go/vX.Y.Z`.
//
// No major-version suffix: Go allows `/vN` only for N >= 2 — a module path
// ending in `/v1` is rejected as malformed by every consumer's `go get`. When a
// breaking 2.0.0 ships, the path becomes `.../go/v2`.
module github.com/Misar-AI/misarpost-sdks/go

go 1.22
