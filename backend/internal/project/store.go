package project

import (
	"crypto/rand"
	"encoding/hex"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type Git interface {
	IsRepo(path string) bool
	Init(path string) error
}

type StubGit struct {
	IsRepoVal  bool
	InitErr    error
	InitCalled []string
}

func (s *StubGit) IsRepo(path string) bool { return s.IsRepoVal }
func (s *StubGit) Init(path string) error {
	s.InitCalled = append(s.InitCalled, path)
	return s.InitErr
}

type Store struct {
	mu       sync.RWMutex
	git      Git
	projects map[string]Project
}

func NewStore(git Git) *Store {
	return &Store{
		git:      git,
		projects: make(map[string]Project),
	}
}

func (s *Store) Create(path string) (Project, error) {
	if !s.git.IsRepo(path) {
		if err := s.git.Init(path); err != nil {
			return Project{}, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	p := Project{
		ID:        newID(),
		Title:     filepath.Base(path),
		Path:      path,
		ColorIdx:  len(s.projects) % ColorPaletteSize,
		CreatedAt: time.Now().Unix(),
	}
	s.projects[p.ID] = p
	return p, nil
}

func (s *Store) Get(id string) (Project, bool) {
	s.mu.RLock()
	p, ok := s.projects[id]
	s.mu.RUnlock()
	return p, ok
}

func (s *Store) List() []Project {
	s.mu.RLock()
	out := make([]Project, 0, len(s.projects))
	for _, p := range s.projects {
		out = append(out, p)
	}
	s.mu.RUnlock()
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt < out[j].CreatedAt
	})
	return out
}

func (s *Store) UpdateTitle(id, title string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.projects[id]
	if !ok {
		return false
	}
	p.Title = title
	s.projects[id] = p
	return true
}

func (s *Store) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.projects[id]; !ok {
		return false
	}
	delete(s.projects, id)
	return true
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic("project: failed to generate ID: " + err.Error())
	}
	return hex.EncodeToString(b)
}
