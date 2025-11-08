class BatteryMonitor {
    constructor() {
        this.battery = null;
        this.history = [];
        this.maxHistory = 60;
        this.updateInterval = null;
        this.wakeLock = null;
        this.notificationsEnabled = false;
        this.lastNotificationLevel = 100;
        this.estimatedCapacity = 3000; // mAh, will be refined over time
        this.dischargeRateSamples = [];
        this.init();
    }

    async init() {
        try {
            this.battery = await navigator.getBattery();
            this.setupEventListeners();
            this.setupControls();
            this.setupTabs();
            this.requestNotificationPermission();
            this.updateDisplay();
            this.startMonitoring();
        } catch (error) {
            console.error('Battery API not supported:', error);
            this.showError();
        }
    }

    setupEventListeners() {
        this.battery.addEventListener('levelchange', () => this.updateDisplay());
        this.battery.addEventListener('chargingchange', () => this.updateDisplay());
        this.battery.addEventListener('chargingtimechange', () => this.updateDisplay());
        this.battery.addEventListener('dischargingtimechange', () => this.updateDisplay());
    }

    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });
    }

    switchTab(tabId) {
        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Add active class to selected tab and button
        const targetPane = document.getElementById(tabId);
        const targetButton = document.querySelector(`[data-tab="${tabId}"]`);
        
        if (targetPane) targetPane.classList.add('active');
        if (targetButton) targetButton.classList.add('active');

        // Update chart if switching to history tab
        if (tabId === 'historyTab') {
            setTimeout(() => this.updateChart(), 100);
        }
    }

    setupControls() {
        // Wake lock toggle
        const wakeLockToggle = document.getElementById('wakeLockToggle');
        wakeLockToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.requestWakeLock();
            } else {
                this.releaseWakeLock();
            }
        });

        // Notification toggle
        const notificationToggle = document.getElementById('notificationToggle');
        notificationToggle.addEventListener('change', (e) => {
            this.notificationsEnabled = e.target.checked;
            if (this.notificationsEnabled) {
                this.requestNotificationPermission();
            }
        });
    }

    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake lock active');
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('Wake lock released');
                });
            }
        } catch (err) {
            console.error('Wake lock error:', err);
            document.getElementById('wakeLockToggle').checked = false;
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    }

    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    showNotification(title, body) {
        if (this.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: '⚡',
                badge: '🔋'
            });
        }
    }

    checkBatteryAlerts(level) {
        if (!this.notificationsEnabled) return;

        if (level <= 20 && this.lastNotificationLevel > 20) {
            this.showNotification('Low Battery', `Battery at ${level}%. Please charge soon.`);
        } else if (level <= 10 && this.lastNotificationLevel > 10) {
            this.showNotification('Critical Battery', `Battery critically low at ${level}%!`);
        } else if (level >= 80 && this.battery.charging && this.lastNotificationLevel < 80) {
            this.showNotification('Battery Charged', `Battery at ${level}%. Consider unplugging for optimal health.`);
        }

        this.lastNotificationLevel = level;
    }

    startMonitoring() {
        this.updateInterval = setInterval(() => {
            this.recordHistory();
            this.updateDisplay();
            this.updateChart();
        }, 5000);
    }

    recordHistory() {
        if (!this.battery) return;

        const dataPoint = {
            timestamp: Date.now(),
            level: this.battery.level * 100,
            charging: this.battery.charging
        };

        this.history.push(dataPoint);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        // Calculate discharge rate
        if (!this.battery.charging && this.history.length >= 2) {
            this.calculateDischargeRate();
        }
    }

    calculateDischargeRate() {
        const recent = this.history.slice(-10);
        if (recent.length < 2) return;

        const timeDiff = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000 / 3600; // hours
        const levelDiff = recent[0].level - recent[recent.length - 1].level; // percentage

        if (timeDiff > 0 && levelDiff > 0) {
            const rate = (levelDiff / timeDiff / 100) * this.estimatedCapacity;
            this.dischargeRateSamples.push(rate);
            if (this.dischargeRateSamples.length > 10) {
                this.dischargeRateSamples.shift();
            }
        }
    }

    getAverageDischargeRate() {
        if (this.dischargeRateSamples.length === 0) return 0;
        const sum = this.dischargeRateSamples.reduce((a, b) => a + b, 0);
        return sum / this.dischargeRateSamples.length;
    }

    updateDisplay() {
        if (!this.battery) return;

        const level = Math.round(this.battery.level * 100);
        const charging = this.battery.charging;

        // Update battery level
        document.getElementById('batteryLevel').textContent = `${level}%`;

        // Update status
        const status = charging ? 'Charging' : 'Discharging';
        document.getElementById('batteryStatus').textContent = status;

        // Update progress ring
        this.updateProgressRing(level, charging);

        // Update stats
        this.updateStats(level, charging);

        // Check for alerts
        this.checkBatteryAlerts(level);

        // Update charging info visibility
        const chargingInfo = document.getElementById('chargingInfo');
        chargingInfo.style.display = charging ? 'block' : 'none';

        if (charging) {
            this.updateChargingInfo();
        }
    }

    updateProgressRing(level, charging) {
        const circle = document.querySelector('.progress-ring-fill');
        const circumference = 2 * Math.PI * 85;
        const offset = circumference - (level / 100) * circumference;

        circle.style.strokeDashoffset = offset;

        // Color based on level and charging state
        let color;
        if (charging) {
            color = '#3b82f6'; // Blue when charging
        } else if (level > 50) {
            color = '#4ade80'; // Green
        } else if (level > 20) {
            color = '#facc15'; // Yellow
        } else {
            color = '#ef4444'; // Red
        }
        circle.style.stroke = color;
    }

    updateStats(level, charging) {
        // Simulated health (Battery API doesn't provide this)
        document.getElementById('batteryHealth').textContent = '95%';

        // Simulated temperature
        const temp = (25 + Math.random() * 10).toFixed(1);
        document.getElementById('batteryTemp').textContent = `${temp}°C`;

        // Simulated voltage
        const voltage = (3.7 + (level / 100) * 0.5).toFixed(2);
        document.getElementById('batteryVoltage').textContent = `${voltage}V`;

        // Capacity
        document.getElementById('batteryCapacity').textContent = `${this.estimatedCapacity} mAh`;

        // Discharge rate
        if (!charging) {
            const rate = this.getAverageDischargeRate();
            if (rate > 0) {
                document.getElementById('dischargeRate').textContent = `${rate.toFixed(0)} mA`;
            } else {
                document.getElementById('dischargeRate').textContent = 'Calculating...';
            }
        } else {
            document.getElementById('dischargeRate').textContent = 'N/A';
        }

        // Time remaining
        if (charging) {
            const chargingTime = this.battery.chargingTime;
            if (chargingTime === Infinity) {
                document.getElementById('timeRemaining').textContent = 'Calculating...';
            } else {
                const hours = Math.floor(chargingTime / 3600);
                const minutes = Math.floor((chargingTime % 3600) / 60);
                document.getElementById('timeRemaining').textContent = `${hours}h ${minutes}m`;
            }
        } else {
            const dischargingTime = this.battery.dischargingTime;
            if (dischargingTime === Infinity) {
                document.getElementById('timeRemaining').textContent = 'Calculating...';
            } else {
                const hours = Math.floor(dischargingTime / 3600);
                const minutes = Math.floor((dischargingTime % 3600) / 60);
                document.getElementById('timeRemaining').textContent = `${hours}h ${minutes}m`;
            }
        }
    }

    updateChargingInfo() {
        // Simulated charging speed
        const speed = (1000 + Math.random() * 500).toFixed(0);
        document.getElementById('chargingSpeed').textContent = `${speed}mA`;

        const chargingTime = this.battery.chargingTime;
        if (chargingTime === Infinity) {
            document.getElementById('timeToFull').textContent = 'Calculating...';
        } else {
            const hours = Math.floor(chargingTime / 3600);
            const minutes = Math.floor((chargingTime % 3600) / 60);
            document.getElementById('timeToFull').textContent = `${hours}h ${minutes}m`;
        }
    }

    updateChart() {
        const canvas = document.getElementById('batteryChart');
        const ctx = canvas.getContext('2d');

        canvas.width = canvas.offsetWidth * window.devicePixelRatio;
        canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;

        ctx.clearRect(0, 0, width, height);

        if (this.history.length < 2) return;

        // Draw grid
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw line
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();

        this.history.forEach((point, index) => {
            const x = (index / (this.maxHistory - 1)) * width;
            const y = height - (point.level / 100) * height;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    }

    showError() {
        document.getElementById('batteryLevel').textContent = 'N/A';
        document.getElementById('batteryStatus').textContent = 'API not supported';
    }
}

// Initialize app
new BatteryMonitor();