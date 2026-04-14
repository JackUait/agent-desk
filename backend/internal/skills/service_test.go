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

func TestServiceReadWriteContent(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	writeFile(t, filepath.Join(skillsRoot, "alpha", "SKILL.md"),
		"---\nname: alpha\ndescription: one\n---\nbody one")

	svc := NewService(Roots{Writable: []string{skillsRoot}})
	path := filepath.Join(skillsRoot, "alpha", "SKILL.md")

	c, err := svc.ReadContent(path)
	if err != nil {
		t.Fatal(err)
	}
	if c.Frontmatter["name"] != "alpha" || c.Body != "body one" {
		t.Errorf("unexpected content: %+v", c)
	}

	updated := "---\nname: alpha\ndescription: two\n---\nbody two"
	c2, err := svc.WriteContent(path, updated)
	if err != nil {
		t.Fatal(err)
	}
	if c2.Frontmatter["description"] != "two" || c2.Body != "body two" {
		t.Errorf("unexpected write result: %+v", c2)
	}

	raw, _ := os.ReadFile(path)
	if string(raw) != updated {
		t.Errorf("file not updated: %q", string(raw))
	}

	if _, err := svc.WriteContent(filepath.Join(tmp, "evil.md"), "x"); err == nil {
		t.Error("expected rejection for write outside writable roots")
	}
}

func TestServiceCreateSkill(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	commandsRoot := filepath.Join(tmp, "commands")
	if err := os.MkdirAll(skillsRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(commandsRoot, 0o755); err != nil {
		t.Fatal(err)
	}

	svc := NewService(Roots{Writable: []string{skillsRoot, commandsRoot}})

	skill, err := svc.Create(KindSkill, "new-skill", "initial body")
	if err != nil {
		t.Fatal(err)
	}
	if skill.Kind != KindSkill || skill.Name != "new-skill" {
		t.Errorf("unexpected: %+v", skill)
	}
	if _, err := os.Stat(filepath.Join(skillsRoot, "new-skill", "SKILL.md")); err != nil {
		t.Errorf("file not created: %v", err)
	}

	cmd, err := svc.Create(KindCommand, "greet", "")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Kind != KindCommand || cmd.Name != "greet" {
		t.Errorf("unexpected: %+v", cmd)
	}
	if _, err := os.Stat(filepath.Join(commandsRoot, "greet.md")); err != nil {
		t.Errorf("file not created: %v", err)
	}

	if _, err := svc.Create(KindSkill, "new-skill", ""); err == nil {
		t.Error("expected duplicate rejection")
	}
}

func TestServiceRename(t *testing.T) {
	tmp := t.TempDir()
	skillsRoot := filepath.Join(tmp, "skills")
	commandsRoot := filepath.Join(tmp, "commands")
	writeFile(t, filepath.Join(skillsRoot, "old", "SKILL.md"),
		"---\nname: old\n---\nbody")
	writeFile(t, filepath.Join(commandsRoot, "old.md"),
		"---\nname: old\n---\nbody")

	svc := NewService(Roots{Writable: []string{skillsRoot, commandsRoot}})

	newSkill, err := svc.Rename(filepath.Join(skillsRoot, "old", "SKILL.md"), "fresh")
	if err != nil {
		t.Fatal(err)
	}
	if newSkill != filepath.Join(skillsRoot, "fresh", "SKILL.md") {
		t.Errorf("unexpected new path: %s", newSkill)
	}

	newCmd, err := svc.Rename(filepath.Join(commandsRoot, "old.md"), "fresh")
	if err != nil {
		t.Fatal(err)
	}
	if newCmd != filepath.Join(commandsRoot, "fresh.md") {
		t.Errorf("unexpected new path: %s", newCmd)
	}

	writeFile(t, filepath.Join(commandsRoot, "taken.md"), "x")
	if _, err := svc.Rename(filepath.Join(commandsRoot, "fresh.md"), "taken"); err == nil {
		t.Error("expected collision error")
	}
}
