package skills

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestServiceListUser(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	commandsRoot := filepath.Join(tmp, "commands")

	writeFile(t, filepath.Join(skillsRoot, "alpha", "SKILL.md"),
		"---\nname: alpha\ndescription: first skill\n---\nbody")
	writeFile(t, filepath.Join(commandsRoot, "greet.md"),
		"---\ndescription: say hi\n---\n/greet")

	svc := NewService(Roots{Writable: []string{skillsRoot, commandsRoot}})
	items, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name < items[j].Name })

	if len(items) != 2 {
		t.Fatalf("want 2 items, got %d", len(items))
	}
	if items[0].Name != "alpha" || items[0].Kind != KindSkill || items[0].Source != SourceUser {
		t.Errorf("unexpected item[0]: %+v", items[0])
	}
	if items[1].Name != "greet" || items[1].Kind != KindCommand || items[1].Source != SourceUser {
		t.Errorf("unexpected item[1]: %+v", items[1])
	}
}

func TestServiceListPlugin(t *testing.T) {
	tmp := t.TempDir()
	pluginSkills := filepath.Join(tmp, "plugins", "cache", "caveman", "1.0.0", "skills")
	writeFile(t, filepath.Join(pluginSkills, "caveman", "SKILL.md"),
		"---\nname: caveman\ndescription: talk caveman\n---\nbody")

	svc := NewService(Roots{Readable: []string{pluginSkills}})
	items, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item, got %d", len(items))
	}
	it := items[0]
	if it.Source != SourcePlugin || !it.ReadOnly || it.PluginName != "caveman" {
		t.Errorf("unexpected plugin item: %+v", it)
	}
}
