package skills

import (
	"reflect"
	"testing"
)

func TestSplitFrontmatter(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		wantFM   map[string]string
		wantBody string
	}{
		{
			name:     "no frontmatter",
			input:    "# Hello\nbody",
			wantFM:   map[string]string{},
			wantBody: "# Hello\nbody",
		},
		{
			name:     "with frontmatter",
			input:    "---\nname: foo\ndescription: bar baz\n---\n# Hello\nbody",
			wantFM:   map[string]string{"name": "foo", "description": "bar baz"},
			wantBody: "# Hello\nbody",
		},
		{
			name:     "frontmatter only",
			input:    "---\nname: foo\n---\n",
			wantFM:   map[string]string{"name": "foo"},
			wantBody: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fm, body := SplitFrontmatter(tc.input)
			if !reflect.DeepEqual(fm, tc.wantFM) {
				t.Errorf("frontmatter = %v, want %v", fm, tc.wantFM)
			}
			if body != tc.wantBody {
				t.Errorf("body = %q, want %q", body, tc.wantBody)
			}
		})
	}
}

func TestAssembleFrontmatter(t *testing.T) {
	fm := map[string]string{"name": "foo", "description": "bar"}
	body := "# Hello"
	got := AssembleFrontmatter(fm, body)
	want := "---\ndescription: bar\nname: foo\n---\n# Hello"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestAssembleFrontmatterEmpty(t *testing.T) {
	got := AssembleFrontmatter(map[string]string{}, "body only")
	if got != "body only" {
		t.Errorf("got %q, want %q", got, "body only")
	}
}
