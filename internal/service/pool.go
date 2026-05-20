package service

import (
	"time"

	"github.com/obeej/akin/internal/repository"
)

const minUniqueGivers = 3

type PoolResult struct {
	TotalKobo    int64
	DepositCount int64
	UniqueGivers int64
	Hidden       bool
	HiddenReason string
}

type PoolService struct {
	repo *repository.DepositRepo
}

func NewPoolService(repo *repository.DepositRepo) *PoolService {
	return &PoolService{repo: repo}
}

func (s *PoolService) ThisWeek() (*PoolResult, error) {
	since := time.Now().Add(-7 * 24 * time.Hour)
	summary, err := s.repo.SummarySince(since)
	if err != nil {
		return nil, err
	}

	result := &PoolResult{
		DepositCount: summary.DepositCount,
		UniqueGivers: summary.UniqueGivers,
	}

	// Privacy rule: hide total if fewer than 3 unique givers — avoids
	// effectively pointing at a single individual.
	if summary.UniqueGivers < minUniqueGivers {
		result.Hidden = true
		result.HiddenReason = "min_bucket"
		return result, nil
	}

	result.TotalKobo = summary.TotalKobo
	return result, nil
}
