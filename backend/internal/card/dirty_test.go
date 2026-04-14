package card

import (
	"reflect"
	"sort"
	"testing"
)

func newServiceForDirtyTest(t *testing.T) (*Service, Card) {
	t.Helper()
	svc := NewService(NewStore())
	c := svc.CreateCard("proj", "title")
	return svc, c
}

func TestDrainDirtyEmptyAtStart(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected no flags, got %+v", flags)
	}
}

func TestUserUpdateMarksDirty(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	_, err := svc.UpdateFields(c.ID, map[string]any{
		"title":       "new title",
		"description": "new desc",
	})
	if err != nil {
		t.Fatalf("UpdateFields: %v", err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	sort.Strings(flags)
	want := []string{"description", "title"}
	if !reflect.DeepEqual(flags, want) {
		t.Fatalf("flags = %v, want %v", flags, want)
	}
}

func TestDrainClearsAfterRead(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	_, _ = svc.UpdateFields(c.ID, map[string]any{"title": "a"})
	_, _ = svc.DrainDirty(c.ID)
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("expected cleared, got %+v", flags)
	}
}

func TestAgentUpdateDoesNotMarkDirty(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	_, err := svc.UpdateFieldsFromAgent(c.ID, map[string]any{
		"title":       "agent title",
		"description": "agent desc",
	})
	if err != nil {
		t.Fatalf("UpdateFieldsFromAgent: %v", err)
	}
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 0 {
		t.Fatalf("agent update should not dirty, got %+v", flags)
	}
}

func TestMarkDirtyDedupes(t *testing.T) {
	svc, c := newServiceForDirtyTest(t)
	svc.MarkDirty(c.ID, "attachments")
	svc.MarkDirty(c.ID, "attachments")
	flags, _ := svc.DrainDirty(c.ID)
	if len(flags) != 1 || flags[0] != "attachments" {
		t.Fatalf("unexpected flags %+v", flags)
	}
}
