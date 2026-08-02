CREATE TABLE `case_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(128) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `case_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidence_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(255) NOT NULL,
	`sourceType` enum('observation','document','message','system','external') NOT NULL,
	`sourceReference` text,
	`contentHash` varchar(128),
	`notes` text,
	`capturedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `security_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`summary` text,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','monitoring','contained','closed') NOT NULL DEFAULT 'open',
	`confidence` int NOT NULL DEFAULT 50,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `security_cases_id` PRIMARY KEY(`id`)
);
