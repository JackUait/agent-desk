package skills

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Service struct {
	roots Roots
}

func NewService(roots Roots) *Service {
	return &Service{roots: roots}
}

func (s *Service) Roots() Roots { return s.roots }

func (s *Service) List() ([]Item, error) {
	var items []Item
	for _, root := range s.roots.Writable {
		kind := detectKindForRoot(root)
		entries, err := listDir(root)
		if err != nil {
			return nil, err
		}
		for _, name := range entries {
			full := filepath.Join(root, name)
			item, ok, err := loadItem(full, kind, SourceUser, "")
			if err != nil {
				return nil, err
			}
			if ok {
				items = append(items, item)
			}
		}
	}
	for _, root := range s.roots.Readable {
		kind := detectKindForRoot(root)
		entries, err := listDir(root)
		if err != nil {
			return nil, err
		}
		plugin := pluginNameFromRoot(root)
		for _, name := range entries {
			full := filepath.Join(root, name)
			item, ok, err := loadItem(full, kind, SourcePlugin, plugin)
			if err != nil {
				return nil, err
			}
			if ok {
				items = append(items, item)
			}
		}
	}
	return items, nil
}

func detectKindForRoot(root string) ItemKind {
	base := filepath.Base(root)
	if base == "commands" {
		return KindCommand
	}
	return KindSkill
}

func pluginNameFromRoot(root string) string {
	parts := strings.Split(filepath.ToSlash(root), "/")
	for i := 0; i < len(parts)-1; i++ {
		if parts[i] == "cache" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func listDir(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out, nil
}

func loadItem(full string, kind ItemKind, source ItemSource, pluginName string) (Item, bool, error) {
	info, err := os.Stat(full)
	if err != nil {
		return Item{}, false, err
	}
	var filePath, name string
	switch kind {
	case KindSkill:
		if !info.IsDir() {
			return Item{}, false, nil
		}
		filePath = filepath.Join(full, "SKILL.md")
		if _, err := os.Stat(filePath); err != nil {
			return Item{}, false, nil
		}
		name = info.Name()
	case KindCommand:
		if info.IsDir() || !strings.HasSuffix(info.Name(), ".md") {
			return Item{}, false, nil
		}
		filePath = full
		name = strings.TrimSuffix(info.Name(), ".md")
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return Item{}, false, err
	}
	fm, _ := SplitFrontmatter(string(data))
	displayName := fm["name"]
	if displayName == "" {
		displayName = name
	}
	readOnly := source == SourcePlugin
	return Item{
		ID:          fmt.Sprintf("%s:%s:%s", source, kind, filePath),
		Kind:        kind,
		Name:        displayName,
		Description: fm["description"],
		Source:      source,
		PluginName:  pluginName,
		ReadOnly:    readOnly,
		Path:        filePath,
	}, true, nil
}

func (s *Service) ReadContent(path string) (Content, error) {
	resolved, err := ResolveReadable(path, s.roots)
	if err != nil {
		return Content{}, err
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return Content{}, err
	}
	fm, body := SplitFrontmatter(string(data))
	return Content{Path: resolved, Body: body, Frontmatter: fm}, nil
}

func (s *Service) WriteContent(path, content string) (Content, error) {
	resolved, err := ResolveWritable(path, s.roots)
	if err != nil {
		return Content{}, err
	}
	if err := os.WriteFile(resolved, []byte(content), 0o644); err != nil {
		return Content{}, err
	}
	fm, body := SplitFrontmatter(content)
	return Content{Path: resolved, Body: body, Frontmatter: fm}, nil
}
