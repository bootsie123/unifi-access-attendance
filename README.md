# Unifi Access Attendance

An automated way to handle daily attendance using badge scans from Unifi Access with SchoolPass.

Simply install the application, configure the settings to your liking, and watch it go! Any badge scans made inside of the `ATTENDANCE_START` and `ATTENDANCE_END` window will cause the matching student in SchoolPass to remain present while everyone else will get marked as absent. If a student is absent and scans in after the window but before the `SCHOOL_DISMISSAL_TIME`, they will get marked as a late arrival.

**Note: Student names within Unifi Access must also match to their name in SchoolPass**

## Features

- Marks students as present, absent, and late
- Individual control over attendance window start and end times (along with school dismissal times)
- Filter applicable students by dismissional locations through regular expressions
- Auto school day detection (the minimum number of students which must be present in order for attendance to be taken)
- Dry run mode which allows for testing without making changes
- Easily deployable through Docker

## Installation

**_Note: Certain project settings must be configured before it can be ran_**

### Local

First, clone the repository using [git](https://git-scm.com/) and then use [npm](https://www.npmjs.com/) to install the necessary node modules. If [Node.js](https://nodejs.org/) is not already installed, please do so before running npm.

```bash
# Clone the repository
git clone https://github.com/bootsie123/unifi-access-attendance.git

# Enter the directory
cd unifi-access-attendance

# Install the dependencies
npm install

# Copy example .env file
cp .example.env .env

# Configure the required environment variables
nano .env
```

### Docker

Alternatively, you can install and configure the application with [Docker Compose](https://docs.docker.com/compose/).

```bash
# Clone the repository
git clone https://github.com/bootsie123/unifi-access-attendance.git

# Enter the directory
cd unifi-access-attendance

# Configure the required environment variables
nano docker-compose.yml
```

## Configuration

In order to run the app, the following configuration options must be set in the `.env` file or within `docker-compose.yml`.

| Name                   | Type   | Default | Description                                                                      |
| ---------------------- | ------ | ------- | -------------------------------------------------------------------------------- |
| SCHOOLPASS_USERNAME    | String |         | The username of the user used to authenticate in SchoolPass                      |
| SCHOOLPASS_PASSWORD    | String |         | The password of the user used to authenticate in SchoolPass                      |
| UNIFI_ACCESS_SERVER    | String |         | The URL to the Unifi Access application (typically https://device_ip:12445)      |
| UNIFI_ACCESS_API_TOKEN | String |         | The API token to use for Unifi Access (must have System Log -> View permissions) |

### Application Settings

The following table shows the various configurations options which can be set and their default values. These settings can be set in the `.env` file (for local deployment) or within `docker-compose.yml` if using Docker Compose.

| Name                                | Type    | Default | Description                                                                                                                            |
| ----------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| SCHOOLPASS_USERNAME                 | String  |         | The username of the user used to authenticate in SchoolPass                                                                            |
| SCHOOLPASS_PASSWORD                 | String  |         | The password of the user used to authenticate in SchoolPass                                                                            |
| SCHOOLPASS_DISMISSAL_LOCATION_REGEX | String  |         | A regular expression used to filter applicable students by dismissal location                                                          |
| UNIFI_ACCESS_SERVER                 | String  |         | The URL to the Unifi Access application (typically https://device_ip:12445)                                                            |
| UNIFI_ACCESS_API_TOKEN              | String  |         | The API token to use for Unifi Access (must have System Log -> View permissions)                                                       |
| UNIFI_ACCESS_THRESHOLD              | Number  | 10      | The minimum number of students which need to be present in order for attendance to be taken                                            |
| ATTENDANCE_START                    | String  | 6am     | The start time of the attendance window (see [Time Format](#time-format) for specifics)                                                |
| ATTENDANCE_END                      | String  | 8am     | The end time of the attendance window (see [Time Format](#time-format) for specifics)                                                  |
| SCHOOL_DISMISSAL_TIME               | String  | 3pm     | The time used for the late arrival cutoff (after this point students will stay absent) (see [Time Format](#time-format) for specifics) |
| UPDATE_INTERVAL                     | Number  | 30      | The interval in minutes to update the attendance of students who are late arrivals                                                     |
| DRY_RUN                             | Boolean | false   | Determines whether dry run mode is enabled. In dry run mode, no changes are made and instead logged to the console                     |

## Usage

### Local

To start the application locally simply run:

```bash
npm run build

npm start
```

### Docker

To start the application with Docker, simply run:

```bash
docker compose up -d
```

#### Logging

To see all logs, simply run:

```bash
docker compose logs -f
```

## Time Format

Within the application, all time related strings are parsed using [Moment.js](https://momentjs.com/) with the following formats:

- h:m a Z
- H:m Z
- h a Z
- H Z

### Symbol Meanings

| Symbol | Description                                              |
| ------ | -------------------------------------------------------- |
| h      | Hours (12 hour time)                                     |
| H      | Hours (24 hour time)                                     |
| m      | Minutes                                                  |
| a      | Post or ante meridiem (am or pm)                         |
| Z      | Optional, offset from UTC as `+-HH:MM`, `+-HHMM`, or `Z` |

### Examples

This allows for times to be specified in an intuitive and flexible way. The list below outlines some of the posibilities:

- 2am
- 3pm
- 4 pm
- 8:30am
- 9:15 pm
- 14
- 17:23
- 3:41pm -04:00

## Contributing

Pull requests are welcome. Any changes are appreciated!

## License

This project is licensed under the [MIT License](https://choosealicense.com/licenses/mit/)
