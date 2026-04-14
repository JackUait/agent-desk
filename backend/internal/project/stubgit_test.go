package project

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
