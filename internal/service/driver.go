package service

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/audit"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrAlreadyAppliedDriver  = errors.New("driver_application_exists")
	ErrDriverNotFound        = errors.New("driver_not_found")
	ErrDriverNotApproved     = errors.New("driver_not_approved")
	ErrAttendanceExists      = errors.New("attendance_already_marked")
	ErrInvalidVehicleType    = errors.New("invalid_vehicle_type")
	ErrInvalidAttendanceStatus = errors.New("invalid_attendance_status")
)

var validVehicleTypes = map[string]bool{"car": true, "bus": true, "minivan": true}
var validAttendanceStatuses = map[string]bool{"boarded": true, "no_show": true}

// hourBuckets defines the 6 time-of-day buckets surfaced on the driver
// opportunity heatmap. Each entry is [startHour, endHourExclusive] in 24h
// local time and a display label used by the frontend axis.
var hourBuckets = []struct {
	Start int
	End   int
	Label string
}{
	{7, 8, "07:30"},
	{8, 10, "09:00"},
	{10, 12, "11:00"},
	{12, 14, "13:00"},
	{14, 16, "15:00"},
	{16, 19, "17:00"},
}

// HubOpportunity returns a hubs × hours intensity matrix derived from real
// booking demand over the trailing 14 days, alongside a supply matrix of
// published driver trips. The gap between demand and supply is the real
// opportunity signal for drivers.
type HubOpportunity struct {
	Hubs         []string `json:"hubs"`
	Hours        []string `json:"hours"`
	Matrix       [][]int  `json:"matrix"`       // rider demand (0-4)
	SupplyMatrix [][]int  `json:"supplyMatrix"` // driver supply (0-4)
	GapMatrix    [][]int  `json:"gapMatrix"`    // demand - supply clamped 0-4
}

func (s *DriverService) Opportunities() (*HubOpportunity, error) {
	type row struct {
		HubName string
		Hour    int
		Cnt     int
	}

	// Rider demand — bookings over trailing 14 days.
	var demandRows []row
	if err := s.db.Raw(`
		SELECT h.name AS hub_name, EXTRACT(HOUR FROM t.departure_at)::int AS hour, COUNT(*) AS cnt
		FROM bookings b
		JOIN trips t ON t.id = b.trip_id
		JOIN hubs  h ON h.id = t.origin_hub_id
		WHERE b.status = 'booked'
		  AND t.departure_at >= NOW() - INTERVAL '14 days'
		GROUP BY 1, 2
	`).Scan(&demandRows).Error; err != nil {
		return nil, err
	}

	// Driver supply — published/boarding trips over trailing 14 days.
	var supplyRows []row
	if err := s.db.Raw(`
		SELECT h.name AS hub_name, EXTRACT(HOUR FROM t.departure_at)::int AS hour, COUNT(*) AS cnt
		FROM trips t
		JOIN hubs h ON h.id = t.origin_hub_id
		WHERE t.status IN ('published', 'boarding', 'in_transit', 'completed')
		  AND t.departure_at >= NOW() - INTERVAL '14 days'
		GROUP BY 1, 2
	`).Scan(&supplyRows).Error; err != nil {
		return nil, err
	}

	// Aggregate both into hub → bucket maps.
	hubDemandTotals := map[string]int{}
	hubDemand := map[string][]int{}
	for _, r := range demandRows {
		if _, ok := hubDemand[r.HubName]; !ok {
			hubDemand[r.HubName] = make([]int, len(hourBuckets))
		}
		hubDemandTotals[r.HubName] += r.Cnt
		for i, b := range hourBuckets {
			if r.Hour >= b.Start && r.Hour < b.End {
				hubDemand[r.HubName][i] += r.Cnt
				break
			}
		}
	}

	hubSupply := map[string][]int{}
	for _, r := range supplyRows {
		if _, ok := hubSupply[r.HubName]; !ok {
			hubSupply[r.HubName] = make([]int, len(hourBuckets))
		}
		for i, b := range hourBuckets {
			if r.Hour >= b.Start && r.Hour < b.End {
				hubSupply[r.HubName][i] += r.Cnt
				break
			}
		}
	}

	hubs := topHubs(hubDemandTotals, 4)
	if len(hubs) < 4 {
		hubs = padHubs(s.db, hubs, 4)
	}

	// Find max across both matrices for normalisation.
	maxD, maxS := 0, 0
	for _, h := range hubs {
		for _, v := range hubDemand[h] {
			if v > maxD {
				maxD = v
			}
		}
		for _, v := range hubSupply[h] {
			if v > maxS {
				maxS = v
			}
		}
	}
	if maxD == 0 {
		maxD = 1
	}
	if maxS == 0 {
		maxS = 1
	}

	out := &HubOpportunity{
		Hubs:         hubs,
		Hours:        make([]string, len(hourBuckets)),
		Matrix:       make([][]int, len(hubs)),
		SupplyMatrix: make([][]int, len(hubs)),
		GapMatrix:    make([][]int, len(hubs)),
	}
	for i, b := range hourBuckets {
		out.Hours[i] = b.Label
	}
	for i, h := range hubs {
		out.Matrix[i] = make([]int, len(hourBuckets))
		out.SupplyMatrix[i] = make([]int, len(hourBuckets))
		out.GapMatrix[i] = make([]int, len(hourBuckets))
		for j := range hourBuckets {
			d := 0
			if row, ok := hubDemand[h]; ok {
				d = row[j]
			}
			sup := 0
			if row, ok := hubSupply[h]; ok {
				sup = row[j]
			}
			out.Matrix[i][j] = (d*4 + maxD/2) / maxD
			out.SupplyMatrix[i][j] = (sup*4 + maxS/2) / maxS
			// Gap: how much demand exceeds supply, clamped 0-4.
			gap := out.Matrix[i][j] - out.SupplyMatrix[i][j]
			if gap < 0 {
				gap = 0
			}
			if gap > 4 {
				gap = 4
			}
			out.GapMatrix[i][j] = gap
		}
	}
	return out, nil
}

func topHubs(totals map[string]int, n int) []string {
	type kv struct {
		k string
		v int
	}
	pairs := make([]kv, 0, len(totals))
	for k, v := range totals {
		pairs = append(pairs, kv{k, v})
	}
	// Sort by count desc, name asc. Small N, O(N^2) is fine.
	for i := 0; i < len(pairs); i++ {
		for j := i + 1; j < len(pairs); j++ {
			if pairs[j].v > pairs[i].v || (pairs[j].v == pairs[i].v && pairs[j].k < pairs[i].k) {
				pairs[i], pairs[j] = pairs[j], pairs[i]
			}
		}
	}
	if len(pairs) > n {
		pairs = pairs[:n]
	}
	out := make([]string, len(pairs))
	for i, p := range pairs {
		out[i] = p.k
	}
	return out
}

func padHubs(db *gorm.DB, have []string, n int) []string {
	if len(have) >= n {
		return have
	}
	seen := map[string]bool{}
	for _, h := range have {
		seen[h] = true
	}
	var extras []string
	db.Raw(`SELECT name FROM hubs WHERE active = true ORDER BY name LIMIT ?`, n*2).Scan(&extras)
	for _, e := range extras {
		if len(have) >= n {
			break
		}
		if !seen[e] {
			have = append(have, e)
			seen[e] = true
		}
	}
	return have
}

type DriverService struct {
	repo      *repository.DriverRepo
	stewards  *repository.StewardRepo
	rideRepo  *repository.RideRepo
	notify    *NotificationService
	db        *gorm.DB
}

func NewDriverService(
	repo *repository.DriverRepo,
	stewards *repository.StewardRepo,
	rideRepo *repository.RideRepo,
	notify *NotificationService,
	db *gorm.DB,
) *DriverService {
	return &DriverService{repo: repo, stewards: stewards, rideRepo: rideRepo, notify: notify, db: db}
}

type ApplyDriverInput struct {
	UserID        uuid.UUID
	VehicleType   string
	VehiclePlate  string
	LicenseNumber string
	Note          string
}

func (s *DriverService) Apply(input ApplyDriverInput) (*models.DriverProfile, error) {
	if !validVehicleTypes[input.VehicleType] {
		return nil, ErrInvalidVehicleType
	}
	// Idempotent — return existing if already applied.
	if existing, err := s.repo.FindByUserID(input.UserID); err == nil {
		return existing, nil
	}

	d := &models.DriverProfile{
		UserID:        input.UserID,
		Status:        "pending",
		VehicleType:   input.VehicleType,
		VehiclePlate:  input.VehiclePlate,
		LicenseNumber: input.LicenseNumber,
		Note:          input.Note,
	}
	if err := s.repo.Create(d); err != nil {
		return nil, err
	}
	audit.Record(s.db, input.UserID.String(), "driver_applied", d.ID.String(), map[string]any{
		"vehicleType": d.VehicleType,
	})
	return d, nil
}

func (s *DriverService) GetByUserID(userID uuid.UUID) (*models.DriverProfile, error) {
	d, err := s.repo.FindByUserID(userID)
	if err != nil {
		return nil, ErrDriverNotFound
	}
	return d, nil
}

func (s *DriverService) ListPending() ([]models.DriverProfile, error) {
	return s.repo.ListPending()
}

type DecideDriverInput struct {
	DriverProfileID uuid.UUID
	StewardID       uuid.UUID
	Decision        string // approve | decline
	Note            string
}

type DecideDriverResult struct {
	Profile      *models.DriverProfile
	Transitioned bool
	SignoffsSoFar int
}

// Decide applies the same two-person rule as recipient decisions.
func (s *DriverService) Decide(input DecideDriverInput) (*DecideDriverResult, error) {
	if input.Decision != "approve" && input.Decision != "decline" {
		return nil, ErrInvalidDecision
	}

	d, err := s.repo.FindByID(input.DriverProfileID)
	if err != nil {
		return nil, ErrDriverNotFound
	}
	if d.Status != "pending" {
		return nil, ErrAlreadyDecided
	}
	if d.UserID == input.StewardID {
		return nil, ErrSelfReview
	}
	if _, err := s.stewards.FindActionByStewardAndSubject(input.StewardID, d.ID, "driver"); err == nil {
		return nil, ErrAlreadyRecorded
	}

	action := &models.StewardAction{
		StewardID:   input.StewardID,
		SubjectType: "driver",
		SubjectID:   d.ID,
		Decision:    input.Decision,
		Note:        input.Note,
	}
	if err := s.stewards.CreateAction(action); err != nil {
		return nil, err
	}

	matching, _ := s.stewards.ListActionsBySubjectAndDecision(d.ID, "driver", input.Decision)
	unique := uniqueStewardActions(matching)
	result := &DecideDriverResult{Profile: d, SignoffsSoFar: len(unique)}

	if len(unique) >= 2 {
		now := time.Now()
		newStatus := map[string]string{"approve": "approved", "decline": "declined"}[input.Decision]
		if err := s.repo.UpdateStatus(d.ID, map[string]any{"status": newStatus, "decided_at": &now}); err != nil {
			return nil, err
		}
		result.Transitioned = true
		result.Profile.Status = newStatus

		_ = s.notify.Send(d.UserID, "driver_"+newStatus,
			map[string]string{"approved": "You're approved to drive", "declined": "Driver application update"}[newStatus],
			map[string]string{
				"approved": "Your driver application has been approved. You can now publish trips.",
				"declined": "Your driver application was not approved at this time.",
			}[newStatus],
		)
		audit.Record(s.db, input.StewardID.String(), "driver_"+newStatus, d.ID.String(), map[string]any{
			"stewardActions": len(unique),
		})
	}

	return result, nil
}

// MarkAttendance — driver marks each booked rider as boarded or no_show.
type MarkAttendanceInput struct {
	BookingID uuid.UUID
	TripID    uuid.UUID
	RiderID   uuid.UUID
	DriverID  uuid.UUID
	Status    string // boarded | no_show
}

func (s *DriverService) MarkAttendance(input MarkAttendanceInput) (*models.TripAttendance, error) {
	if !validAttendanceStatuses[input.Status] {
		return nil, ErrInvalidAttendanceStatus
	}
	// Verify the trip belongs to this driver.
	trip, err := s.rideRepo.FindTrip(input.TripID)
	if err != nil || trip.DriverID != input.DriverID {
		return nil, ErrNotYourTrip
	}
	// Idempotent.
	if existing, err := s.repo.FindTripAttendance(input.BookingID); err == nil {
		return existing, nil
	}

	a := &models.TripAttendance{
		BookingID: input.BookingID,
		TripID:    input.TripID,
		RiderID:   input.RiderID,
		Status:    input.Status,
		MarkedAt:  time.Now(),
	}
	if err := s.repo.CreateTripAttendance(a); err != nil {
		return nil, err
	}
	audit.Record(s.db, input.DriverID.String(), "attendance_marked", a.ID.String(), map[string]any{
		"status": input.Status,
	})
	// A no-show means the rider held a subsidised seat someone else couldn't
	// take. Record a strike (best-effort — never block the driver's marking).
	if input.Status == "no_show" {
		_ = defaultIntegrity.RecordRideNoShow(input.RiderID, input.TripID)
	}
	return a, nil
}
