"""Security-first core for the Web Intelligence Platform."""

from .crawl_admission import BrowserCrawlAdmission, HttpCrawlAdmission, SharedCrawlAdmission
from .source_policy import (
    AuditDecision,
    AuthorizedTarget,
    CrawlBudgetExceeded,
    CrawlBudgetTracker,
    CrawlLimits,
    CrawlPolicyError,
    DecisionReason,
    MemoryAuditSink,
    RobotsBehavior,
    SourcePolicy,
    SourcePolicyGuard,
)

__all__ = [
    "AuditDecision",
    "AuthorizedTarget",
    "BrowserCrawlAdmission",
    "CrawlBudgetExceeded",
    "CrawlBudgetTracker",
    "CrawlLimits",
    "CrawlPolicyError",
    "DecisionReason",
    "HttpCrawlAdmission",
    "MemoryAuditSink",
    "RobotsBehavior",
    "SharedCrawlAdmission",
    "SourcePolicy",
    "SourcePolicyGuard",
]
