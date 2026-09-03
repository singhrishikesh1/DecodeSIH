class CostRiskEngine:
    """
    Civil Engineering Material Quantity & Repair Cost Estimation Engine
    Includes automated Risk Scoring based on defect geometry, severity & asset type.
    """

    def __init__(self, currency="₹"):
        self.currency = currency
        
        # Standard Civil Rates (in ₹)
        self.unit_rates = {
            "bitumen_asphalt_per_m3": 14500,     # ₹14,500 / m^3 asphalt concrete mix
            "cement_per_bag": 380,               # ₹380 / 50kg bag (~0.035 m^3)
            "sand_per_cuft": 65,                 # ₹65 / cu.ft sand
            "aggregate_per_cuft": 75,            # ₹75 / cu.ft aggregate
            "anti_rust_coating_per_m2": 450,     # ₹450 / m^2 anti-rust primer + epoxy
            "rail_ballast_per_m3": 2800,         # ₹2,800 / m^3 crushed stone ballast
            "labor_base_rate_per_day": 1200,     # Base skilled labor per day
        }

    def estimate_pothole_repair(self, volumetric_data):
        """
        Pothole repair material calculation:
        Bitumen/Asphalt mix volume = Volume * 1.15 (compaction factor)
        Tack coat primer = Surface Area * 0.5 L/m^2
        """
        vol_m3 = volumetric_data.get("volume_m3", 0.08)
        area_m2 = volumetric_data.get("surface_area_m2", 0.6)

        compacted_vol_m3 = vol_m3 * 1.15
        asphalt_cost = round(compacted_vol_m3 * self.unit_rates["bitumen_asphalt_per_m3"], 2)
        
        primer_liters = round(area_m2 * 0.5, 2)
        primer_cost = round(primer_liters * 180, 2)
        
        labor_cost = 2500  # Standard crew patch cost
        total_cost = round(asphalt_cost + primer_cost + labor_cost, 2)

        risk_data = self.compute_risk_score(
            defect_type="pothole",
            depth_cm=volumetric_data.get("max_depth_cm", 10),
            area_m2=area_m2,
            asset_type="road"
        )

        return {
            "defect_type": "Pothole",
            "required_materials": [
                {"name": "Bitumen Asphalt Mix", "quantity": f"{compacted_vol_m3:.3f} m³", "unit_cost": f"{self.currency}14,500/m³", "cost": asphalt_cost},
                {"name": "Bituminous Tack Coat Primer", "quantity": f"{primer_liters:.1f} L", "unit_cost": f"{self.currency}180/L", "cost": primer_cost},
                {"name": "Compaction & Skilled Labor", "quantity": "1 Patch Crew", "unit_cost": f"{self.currency}2,500/job", "cost": labor_cost}
            ],
            "total_estimated_cost": total_cost,
            "currency": self.currency,
            "risk_score": risk_data["risk_level"],
            "risk_numeric": risk_data["score"],
            "risk_reasons": risk_data["reasons"],
            "recommended_action": "Fill with dense bituminous macadam (DBM), compact with heavy roller, seal edges."
        }

    def estimate_crack_repair(self, volumetric_data, asset_type="bridge"):
        """
        Concrete Crack Repair calculation:
        Concrete mix (1:2:4 ratio) or Epoxy injection grouting for structural cracks.
        """
        area_m2 = volumetric_data.get("surface_area_m2", 1.2)
        length_m = volumetric_data.get("length_m", 1.5)
        depth_cm = volumetric_data.get("max_depth_cm", 2.0)

        if depth_cm > 4.0:
            # Structural Deep Crack -> High pressure polyurethane / epoxy resin injection
            epoxy_liters = round(length_m * 1.8, 2)
            epoxy_cost = round(epoxy_liters * 850, 2)
            grouting_cost = 4500
            total_cost = round(epoxy_cost + grouting_cost, 2)
            materials = [
                {"name": "Structural Epoxy Resin / Grout", "quantity": f"{epoxy_liters:.1f} L", "unit_cost": f"{self.currency}850/L", "cost": epoxy_cost},
                {"name": "High-Pressure Injection Port & Labor", "quantity": f"{length_m:.1f} meters", "unit_cost": f"{self.currency}3,000/meter", "cost": grouting_cost}
            ]
            action = "High-pressure epoxy injection grouting & structural integrity re-audit."
        else:
            # Hairline / Surface Crack -> Polymer modified mortar / seal
            mortar_kg = round(area_m2 * 4.5, 2)
            mortar_cost = round(mortar_kg * 90, 2)
            labor_cost = 1800
            total_cost = round(mortar_cost + labor_cost, 2)
            materials = [
                {"name": "Polymer Modified Mortar Sealant", "quantity": f"{mortar_kg:.1f} kg", "unit_cost": f"{self.currency}90/kg", "cost": mortar_cost},
                {"name": "Surface Preparation & Application Labor", "quantity": "1 Crew", "unit_cost": f"{self.currency}1,800/job", "cost": labor_cost}
            ]
            action = "V-groove routing, dust cleaning, and polymer modified sealant filling."

        risk_data = self.compute_risk_score(
            defect_type="crack",
            depth_cm=depth_cm,
            area_m2=area_m2,
            asset_type=asset_type
        )

        return {
            "defect_type": "Concrete Structural Crack",
            "required_materials": materials,
            "total_estimated_cost": total_cost,
            "currency": self.currency,
            "risk_score": risk_data["risk_level"],
            "risk_numeric": risk_data["score"],
            "risk_reasons": risk_data["reasons"],
            "recommended_action": action
        }

    def estimate_corrosion_repair(self, volumetric_data):
        """
        Steel Bridge Rust / Corrosion Repair:
        Abrasive sandblasting + Zinc-rich primer + Anti-rust epoxy coating.
        """
        area_m2 = volumetric_data.get("surface_area_m2", 3.4)

        primer_liters = round(area_m2 * 0.35, 2)
        primer_cost = round(primer_liters * 1200, 2)

        epoxy_liters = round(area_m2 * 0.45, 2)
        epoxy_cost = round(epoxy_liters * 950, 2)

        sandblasting_cost = round(area_m2 * 350, 2)
        labor_cost = 3500

        total_cost = round(primer_cost + epoxy_cost + sandblasting_cost + labor_cost, 2)

        risk_data = self.compute_risk_score(
            defect_type="corrosion",
            depth_cm=volumetric_data.get("max_depth_cm", 0.5),
            area_m2=area_m2,
            asset_type="bridge"
        )

        return {
            "defect_type": "Steel Structure Corrosion & Rust",
            "required_materials": [
                {"name": "Zinc-Rich Anti-Corrosive Primer", "quantity": f"{primer_liters:.1f} L", "unit_cost": f"{self.currency}1,200/L", "cost": primer_cost},
                {"name": "Aliphatic Polyurethane Topcoat", "quantity": f"{epoxy_liters:.1f} L", "unit_cost": f"{self.currency}950/L", "cost": epoxy_cost},
                {"name": "Sandblasting Surface Prep", "quantity": f"{area_m2:.1f} m²", "unit_cost": f"{self.currency}350/m²", "cost": sandblasting_cost},
                {"name": "Scaffolding & Rigging Labor", "quantity": "1 Crew", "unit_cost": f"{self.currency}3,500/job", "cost": labor_cost}
            ],
            "total_estimated_cost": total_cost,
            "currency": self.currency,
            "risk_score": risk_data["risk_level"],
            "risk_numeric": risk_data["score"],
            "risk_reasons": risk_data["reasons"],
            "recommended_action": "Abrasive blast cleaning (Sa 2.5), apply 75µm zinc primer and dual-pack polyurethane protective coat."
        }

    def compute_risk_score(self, defect_type, depth_cm, area_m2, asset_type):
        """
        Determines structural risk level: Low, Medium, High, Critical
        Score 0-100 based on severity factors.
        """
        score = 20  # Base
        reasons = []

        # Depth weight
        if depth_cm > 15:
            score += 45
            reasons.append("Severe depth (>15 cm) creates immediate vehicular hazard / structural breach")
        elif depth_cm > 7:
            score += 25
            reasons.append("Moderate depth (7-15 cm) accelerating degradation")
        elif depth_cm > 3:
            score += 10

        # Area weight
        if area_m2 > 3.0:
            score += 25
            reasons.append("Large defect footprint (>3 m²) affecting structural load path")
        elif area_m2 > 1.0:
            score += 15

        # Asset critical weighting
        if asset_type in ["bridge", "railway"]:
            score += 20
            reasons.append(f"High risk asset category ({asset_type.upper()}) where failure carries catastrophic potential")
        elif asset_type == "building":
            score += 10

        # Final Classification
        if score >= 75:
            risk_level = "CRITICAL"
        elif score >= 50:
            risk_level = "HIGH"
        elif score >= 30:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        return {
            "score": min(score, 99),
            "risk_level": risk_level,
            "reasons": reasons if reasons else ["Minor cosmetic defect within acceptable tolerance"]
        }
