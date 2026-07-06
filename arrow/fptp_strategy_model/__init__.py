"""fptp_strategy_model
====================

District-level Monte Carlo simulation of first-past-the-post (single-member
plurality) elections, with a Duvergerian strategic-voting module and an
expected-utility optimiser over *lawful, aggregate* campaign actions.

The package ranks feasible actions by a transparent, risk-adjusted payoff and
returns a confidence-gated recommendation plus a causal decomposition and
sensitivity tests -- not a black-box "do this".

Literature anchored : Cox (1997, 1999), Palfrey (1989),
Myerson & Weber (1993), Fey (1997, 2007), Feddersen (1992), Kselman & Niou
(2010), Myatt (2007), Tufte (1973), Gelman & King (1994), Blais et al. (2011),
Clark & Golder (2006), Osborne & Slivinski (1996), Besley & Coate (1997),
Snyder (1989), Golosov (2018).

This is a research / decision-support tool. It is not legal advice and must be
adapted to the electoral law and data-protection rules of the relevant
jurisdiction.
"""

from .actions import Action, apply_action_effects
from .campaign import CampaignResponseModel
from .config import ALLOWED_ACTION_TYPES, Bloc, DistrictData, ElectionConfig
from .decision import ActionScore, Decision, DecisionEngine, Optimizer
from .engine import StrategyModel
from .entry import EntryCoordinationModel
from .explainer import Decomposition, Explainer
from .mechanical import MechanicalSeatModel
from .ontology import (
    Confidence, ConstituencyAssessment, FPTPContext, FPTPRecommendationLabel,
    FPTPScenarioInput, FPTPScenarioType, OntologyClient, assess_constituency,
    derive_strategic_inputs, district_from_context, recommendation_label,
)
from .payoff import ObjectiveWeights, Outcome, PayoffFunction, RiskConfig
from .preferences import PreferenceModel, VoteModel
from .reporting import format_report
from .simulate import Simulator, SimResult
from .state import ElectionState, StateSampler
from .strategic import StrategicParams, StrategicVotingModel

__version__ = "0.1.0"

__all__ = [
    "Action", "apply_action_effects",
    "Bloc", "DistrictData", "ElectionConfig", "ALLOWED_ACTION_TYPES",
    "PreferenceModel", "VoteModel",
    "StrategicVotingModel", "StrategicParams",
    "MechanicalSeatModel",
    "CampaignResponseModel",
    "EntryCoordinationModel",
    "PayoffFunction", "ObjectiveWeights", "RiskConfig", "Outcome",
    "DecisionEngine", "Optimizer", "ActionScore", "Decision",
    "Explainer", "Decomposition",
    "Simulator", "SimResult",
    "StateSampler", "ElectionState",
    "StrategyModel", "format_report",
    "Confidence", "ConstituencyAssessment", "FPTPContext",
    "FPTPRecommendationLabel", "FPTPScenarioInput", "FPTPScenarioType",
    "OntologyClient", "assess_constituency", "derive_strategic_inputs",
    "district_from_context", "recommendation_label",
]
