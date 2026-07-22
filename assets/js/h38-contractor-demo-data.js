window.H38ContractorDemo = Object.freeze({
  version: "2026.07.22.1",
  updated: "July 22, 2026",
  region: "Deer River / Grand Rapids, Minnesota",
  notice: "Hypothetical contractor demonstration — not a real customer, accepted contract, or completed project. Regional benchmark pricing requires field and supplier verification.",
  imageUrl(id) {
    return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
  },
  quotes: {
    flower: {
      number: "Q-DEMO-001",
      title: "Flower Garden Installation",
      base: 3250,
      scope: "Install approximately 240 sq ft of flower garden with layout, sod removal, soil amendment, edging, mid-range cold-hardy perennials and shrubs, mulch, cleanup, and edge restoration.",
      measurements: [
        "Garden area: approximately 240 sq ft",
        "Average bed depth: approximately 3 ft",
        "Topsoil and amendment allowance: 4.5 cu yd",
        "Mulch allowance: approximately 240 sq ft",
        "Plant selection: 25–30 mid-range plants"
      ],
      includes: [
        "Layout and mark bed edges",
        "Remove sod and unwanted vegetation",
        "Prepare and level the planting bed",
        "Install topsoil and soil amendment",
        "Install cold-hardy plants",
        "Apply dark-brown mulch",
        "Finish grading and cleanup"
      ],
      assumptions: "Normal residential access; no major drainage correction; plant selections are subject to seasonal availability.",
      before: "1QqR5oj3Nw8sjykCnu7Vp5hh6VDIJ6GS9",
      after: "1BIXaFXIVK9FUEyWRSzQgM7CiH_tgk405",
      beforeCaption: "Same house and camera angle before the foundation-side flower garden is installed.",
      afterCaption: "The same house and camera angle with the proposed curved bed, stone edging, mulch, shrubs, and flowers.",
      items: [
        ["Layout and bed marking", "Site layout and bed shaping", 1, "LS", 200],
        ["Sod removal and disposal", "Remove sod and haul off site", 240, "sq ft", 2],
        ["Soil amendment", "Topsoil and organic amendment", 4.5, "cu yd", 80],
        ["Edging", "Steel or composite edging", 60, "linear ft", 6],
        ["Plants", "Mid-range cold-hardy perennials and shrubs", 1, "allowance", 1150],
        ["Mulch", "Premium shredded hardwood mulch", 1, "allowance", 320],
        ["Cleanup and final grading", "Edge restoration and jobsite cleanup", 1, "LS", 380]
      ],
      upgrades: [
        ["Basic drip irrigation zone", "One drip irrigation zone for new plants", 850],
        ["Natural-stone edging", "Install natural-stone edging, approximately 60 linear ft", 1100],
        ["Premium planting package", "Higher-end perennials, shrubs, and accent plants", 1450]
      ]
    },
    drive: {
      number: "Q-DEMO-002",
      title: "Class 5 Driveway — Laying Down and Leveling",
      base: 3250,
      scope: "Supply, place, crown, grade, and compact Class 5 aggregate on an approximately 12 ft × 80 ft driveway at an average compacted depth of 4 inches.",
      measurements: [
        "Length: 80 linear ft",
        "Average width: 12 ft",
        "Surface area: 960 sq ft",
        "Compacted depth: 4 in",
        "Class 5 quantity: approximately 11.9 cu yd before handling allowance"
      ],
      includes: [
        "Clear and shape the driveway path",
        "Establish crown and drainage",
        "Supply and spread Class 5 aggregate",
        "Compact and level the surface",
        "Shape edges and complete final grading",
        "Clean up excess material"
      ],
      assumptions: "Serviceable subgrade and normal truck access; excludes undercutting, frost excavation, and unsuitable-soil removal.",
      before: "1MkSHG4k734T7dmhOmy5JsKFUJyoXW8Dz",
      after: "11fGOY_PJxwvgQm_uMwISvF98XrSXfJK0",
      beforeCaption: "Example dirt and uneven access before Class 5 placement and grading.",
      afterCaption: "Example completed Class 5 driveway after spreading, crowning, leveling, and compaction.",
      items: [
        ["Mobilization and site setup", "Equipment delivery and project setup", 1, "LS", 350],
        ["Shape existing subgrade", "Prepare approximately 960 sq ft", 960, "sq ft", 0.5],
        ["Class 5 aggregate", "Delivered material allowance", 11.9, "cu yd", 120],
        ["Spread, crown, and grade", "Machine spreading and drainage shaping", 1, "LS", 550],
        ["Compaction and finish", "Compact and final-level the surface", 1, "LS", 342],
        ["Edge cleanup", "Shape edges and remove excess material", 1, "LS", 100]
      ],
      upgrades: [
        ["Geotextile separation fabric", "Install separation fabric below aggregate", 1050],
        ["Increase depth from 4 to 6 inches", "Additional aggregate, grading, and compaction", 975],
        ["Residential culvert allowance", "Typical culvert material and installation allowance", 1850]
      ]
    },
    pond: {
      number: "Q-DEMO-003",
      title: "Premium Small Backyard Pond",
      base: 12500,
      scope: "Construct an approximately 10 ft × 14 ft pond, up to 30 inches deep, with excavation, underlayment, EPDM liner, pump, filtration, natural-stone edge, limited aquatic planting, filling, testing, and startup.",
      measurements: [
        "Pond size: approximately 10 ft × 14 ft",
        "Maximum depth: up to 30 in",
        "Surface area: approximately 140 sq ft",
        "Excavation: variable by shelves and access",
        "Pump and filtration sized to final volume"
      ],
      includes: [
        "Excavate and shape the pond basin",
        "Install underlayment and EPDM liner",
        "Install pump, filtration, and plumbing",
        "Set the natural-stone perimeter",
        "Add decorative rock and limited aquatic plants",
        "Fill, test, balance, and provide startup walkthrough"
      ],
      assumptions: "Normal access, a nearby electrical source, excavated material remaining onsite, and no bedrock or high groundwater.",
      before: "12YDZ4GVNUnF0gRWuBqVxTAgzG8tiY6z3",
      after: "18d2FE5VGjM_q62KKTq12w6rsQ0otdUfk",
      beforeCaption: "Example open backyard area before pond excavation and installation.",
      afterCaption: "Example completed backyard pond with natural stone, planting, circulation, and waterfall.",
      items: [
        ["Layout and site protection", "Mark pond area and protect access route", 1, "LS", 500],
        ["Excavation and shaping", "Excavate shelves, basin, and edge profile", 1, "LS", 2800],
        ["Underlayment and EPDM liner", "Premium liner system allowance", 1, "system", 2100],
        ["Pump, filtration, and plumbing", "Circulation and filtration package", 1, "system", 2450],
        ["Natural stone and edge finishing", "Stone perimeter and decorative rock", 1, "LS", 2150],
        ["Aquatic plants and startup", "Limited planting, fill, test, and startup", 1, "LS", 1000],
        ["Cleanup and final grading", "Restore disturbed area and remove debris", 1, "LS", 1500]
      ],
      upgrades: [
        ["Compact stone waterfall", "Add a compact natural-stone waterfall", 1800],
        ["Premium biological filtration", "Upgrade filtration capacity and media", 1250],
        ["Low-voltage pond lighting", "Add low-voltage underwater and edge lighting", 700]
      ]
    },
    clear: {
      number: "Q-DEMO-004",
      title: "Residential Lot Clearing and House-Site Preparation",
      base: 16500,
      scope: "Clear and rough-prepare approximately one acre for a residence with light-to-moderate tree and brush cover, selected tree removal, grubbing in house and driveway zones, onsite material consolidation, rough grading, and cleanup.",
      measurements: [
        "Lot area: approximately 1 acre",
        "Tree cover: light to moderate",
        "House and driveway zones: targeted grubbing",
        "Rough grading area: building and access zones",
        "Debris handling: consolidated onsite where lawful"
      ],
      includes: [
        "Clear selected trees and brush",
        "Remove vegetation in building zones",
        "Grub stumps in house and driveway zones",
        "Rough-grade the building site",
        "Establish equipment access",
        "Consolidate debris and clean up"
      ],
      assumptions: "No wetlands, demolition, hazardous materials, utility conflicts, rock excavation, or unsuitable-soil export in the base price.",
      before: "1DZ55aulS2fzUrJsy1BsibrzzwaiZ_lv5",
      after: "1JU1RbFotwLziQJ5SJsEWgwE2lterUSh9",
      beforeCaption: "Example wooded residential lot before clearing and site preparation.",
      afterCaption: "Example cleared and rough-graded residential building area after site preparation.",
      items: [
        ["Mobilization and equipment delivery", "Move equipment to the site and establish access", 1, "LS", 1500],
        ["Tree and brush clearing", "Light-to-moderate clearing over approximately one acre", 1, "acre", 6000],
        ["Targeted stump grubbing", "House and driveway zones", 1, "LS", 3500],
        ["Rough grading", "House-site and access-zone rough grading", 1, "LS", 4000],
        ["Debris consolidation and cleanup", "Consolidate onsite material where lawful", 1, "LS", 1500]
      ],
      upgrades: [
        ["Expanded full-acre stump grubbing", "Grub remaining stumps throughout the acre", 4500],
        ["House-pad excavation and fill allowance", "Structural pad excavation and imported fill allowance", 9500],
        ["Offsite hauling and disposal allowance", "Load, haul, and dispose of cleared material", 6000]
      ]
    }
  },
  advertising: {
    headline: "Clear plans. Fair pricing. Professional results.",
    summary: "Highway 38 Solutions helps homeowners, contractors, and property owners turn rough ideas, photos, and field information into organized plans, detailed quotes, project guides, and connected business records.",
    capabilities: [
      "Photo and voice-based project capture",
      "Measurements, takeoffs, and quantity calculations",
      "Before-and-after concept visuals",
      "Detailed base scopes and optional upgrades",
      "Regional material and cost estimating",
      "Branded printable and PDF quote packages",
      "Quote-to-job and Job Guide handoff",
      "Business Office records, approvals, proof, and reporting"
    ],
    pricingRanges: [
      ["Flower garden", "$2,500–$4,500"],
      ["Class 5 driveway", "$2,750–$4,500"],
      ["Premium small pond", "$10,000–$16,000"],
      ["One-acre lot clearing", "$12,000–$20,000"]
    ],
    pricingNote: "Sample regional planning ranges only. Final dimensions, access, materials, site conditions, supplier pricing, permits, hauling, disposal, and approved scope control the final quote.",
    platformPricing: "Quote Builder, Job Guide, Business Office, and integrated-system pricing is scoped after a needs review. No automatic purchase or installation.",
    cta: "Request a scoped plan and pricing review"
  }
});
