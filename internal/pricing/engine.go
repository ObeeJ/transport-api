// Package pricing implements physics-based fare calculation.
// Formula: (distance_km / km_per_litre) * fuel_price * driver_margin + platform_fee
package pricing

import (
	"math"
	"sync"
	"time"

	"gorm.io/gorm"
)

type Settings struct {
	FuelPriceNaira  float64 `gorm:"column:fuel_price_naira"`
	DriverMarginPct float64 `gorm:"column:driver_margin_pct"`
	PlatformFeePct  float64 `gorm:"column:platform_fee_pct"`
	PlatformFeeMin  int64   `gorm:"column:platform_fee_min"`
	PlatformFeeMax  int64   `gorm:"column:platform_fee_max"`
	SurgeMorning    float64 `gorm:"column:surge_morning"`
	SurgeEvening    float64 `gorm:"column:surge_evening"`
}

func (Settings) TableName() string { return "pricing_settings" }

type VehicleType struct {
	Code         string  `gorm:"primaryKey"`
	DisplayName  string  `gorm:"column:display_name"`
	KmPerLitre   float64 `gorm:"column:km_per_litre"`
	DefaultSeats int     `gorm:"column:default_seats"`
	FuelType     string  `gorm:"column:fuel_type"`
}

func (VehicleType) TableName() string { return "vehicle_types" }

type Quote struct {
	VehicleCode    string  `json:"vehicleCode"`
	VehicleName    string  `json:"vehicleName"`
	DistanceKm     float64 `json:"distanceKm"`
	FareKobo       int64   `json:"fareKobo"`
	PlatformFeeKobo int64  `json:"platformFeeKobo"`
	DriverEarnsKobo int64  `json:"driverEarnsKobo"`
	SurgeMultiplier float64 `json:"surgeMultiplier"`
}

var (
	cachedSettings *Settings
	cachedVehicles map[string]VehicleType
	cacheMu        sync.RWMutex
	cacheExpiry    time.Time
)

func loadSettings(db *gorm.DB) (*Settings, map[string]VehicleType, error) {
	cacheMu.RLock()
	if time.Now().Before(cacheExpiry) && cachedSettings != nil {
		s, v := cachedSettings, cachedVehicles
		cacheMu.RUnlock()
		return s, v, nil
	}
	cacheMu.RUnlock()

	cacheMu.Lock()
	defer cacheMu.Unlock()

	var s Settings
	if err := db.First(&s).Error; err != nil {
		return nil, nil, err
	}
	var vehicles []VehicleType
	if err := db.Find(&vehicles).Error; err != nil {
		return nil, nil, err
	}
	vm := make(map[string]VehicleType, len(vehicles))
	for _, v := range vehicles {
		vm[v.Code] = v
	}
	cachedSettings = &s
	cachedVehicles = vm
	cacheExpiry = time.Now().Add(5 * time.Minute)
	return &s, vm, nil
}

// InvalidateCache forces a reload on next Quote call (call after admin update).
func InvalidateCache() {
	cacheMu.Lock()
	cacheExpiry = time.Time{}
	cacheMu.Unlock()
}

// Calculate calculates a fare for a given vehicle and distance.
func Calculate(db *gorm.DB, vehicleCode string, distanceKm float64, at time.Time) (Quote, error) {
	s, vehicles, err := loadSettings(db)
	if err != nil {
		return Quote{}, err
	}
	v, ok := vehicles[vehicleCode]
	if !ok {
		v = vehicles["sedan"] // fallback
	}

	// Surge multiplier based on hour.
	surge := 1.0
	h := at.Hour()
	if h >= 6 && h <= 9 {
		surge = s.SurgeMorning
	} else if h >= 17 && h <= 20 {
		surge = s.SurgeEvening
	}

	// Fuel cost for the trip.
	litresNeeded := distanceKm / v.KmPerLitre
	fuelCostNaira := litresNeeded * s.FuelPriceNaira

	// Driver earns fuel cost + margin.
	driverEarnsNaira := fuelCostNaira * (1 + s.DriverMarginPct) * surge

	// Platform fee.
	platformFeeNaira := driverEarnsNaira * s.PlatformFeePct
	platformFeeKobo := int64(math.Round(platformFeeNaira * 100))
	if platformFeeKobo < s.PlatformFeeMin {
		platformFeeKobo = s.PlatformFeeMin
	}
	if platformFeeKobo > s.PlatformFeeMax {
		platformFeeKobo = s.PlatformFeeMax
	}

	driverEarnsKobo := int64(math.Round(driverEarnsNaira * 100))
	fareKobo := driverEarnsKobo + platformFeeKobo

	return Quote{
		VehicleCode:     vehicleCode,
		VehicleName:     v.DisplayName,
		DistanceKm:      distanceKm,
		FareKobo:        fareKobo,
		PlatformFeeKobo: platformFeeKobo,
		DriverEarnsKobo: driverEarnsKobo,
		SurgeMultiplier: surge,
	}, nil
}
