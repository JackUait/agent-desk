package skills

import (
	"errors"
	"path/filepath"
	"strings"
)

var ErrForbiddenPath = errors.New("path not allowed")

func resolveIn(path string, roots []string) (string, error) {
	abs, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", err
	}
	for _, root := range roots {
		rootAbs, err := filepath.Abs(filepath.Clean(root))
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(rootAbs, abs)
		if err != nil {
			continue
		}
		if rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)) {
			return abs, nil
		}
	}
	return "", ErrForbiddenPath
}

// ResolveWritable returns the absolute path if it lives inside one of the
// writable roots, otherwise ErrForbiddenPath.
func ResolveWritable(path string, roots Roots) (string, error) {
	return resolveIn(path, roots.Writable)
}

// ResolveReadable allows writable and readable roots.
func ResolveReadable(path string, roots Roots) (string, error) {
	all := make([]string, 0, len(roots.Writable)+len(roots.Readable))
	all = append(all, roots.Writable...)
	all = append(all, roots.Readable...)
	return resolveIn(path, all)
}
