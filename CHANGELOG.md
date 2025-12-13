# Changelog

## [0.1.2] - 2025-12-12
### Fixed
- Directory tree in generated reports now respects active UI filters/chips
- Fixed issue where extensionless files (e.g., Dockerfile, Makefile) were invisible in the tree
- Fixed contrast issues in Settings labels

### Changed
- Modernized Settings UI to better match VS Code native styling
- Refactored internal Webview logic into ES modules for better maintainability

## [0.1.1] - 2025-09-06
### Changed
- Fixed layout bug

## [0.1.0] - 2025-09-04
### Changed
- **BREAKING CHANGE**: Deprecated the Python FastAPI application. The project is now solely a Visual Studio Code extension.
- Moved all VS Code extension files to the root of the project.
- Updated README.md and project structure to reflect the focus on the VS Code extension.
- Revamped UI and included optional instructions for the output report
- Settings can now be saved locally and globally

## [0.0.6] - 2025-06-05
### Added
- Fixed "Save Settings" in "Global Settings" section

## [0.0.5] - 2025-02-06
### Added
- Split the baseline into multiple smaller files for ease for maintenance
- Added an "Include tree in report" option
- Added full path to files in the report

## [0.0.4] - 2025-02-06
### Added
- Added collapsible subfolders to root folder tree

## [0.0.3] - 2025-02-06
### Fixed
- Tree would render files that weren't part of the file extensions list in the config

## [0.0.2] - 2025-02-06
### Added
- Added VS Code extension version of the app

## [0.0.1] - 2025-02-05
### Added
- Initial release of app (FastAPI only)