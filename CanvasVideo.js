var CanvasVideoPlayer = (function() {
    "use strict";

    var cvpHandlers = {
        canvasClickHandler: null,
        videoTimeUpdateHandler: null,
        videoCanPlayHandler: null,
        windowResizeHandler: null,
        timelineSeekingHandler: null
    };

    var CanvasVideo = function(options) {
        var i;

        var agent = window.navigator.userAgent,
        platform;
        if ((/android/gi).test(agent)) {
            platform = 'android';
        } else if ((/iphone|ipad|ipod/gi).test(agent)) {
            platform = 'ios';
        } else if ((/webkit/gi).test(agent)) {
            platform = 'webkit';
        } else if ((/gecko/gi).test(agent)) {
            platform = 'gecko';
        } else {
            platform = 'etc';
        }

        this.platform = platform;

        var versionStr = '',
        versionNum = 0;

        if(platform === 'android') {
            versionStr = agent.match(/Android\s+([\d\.]+)/i)[0];
            versionStr = versionStr.replace('Android ', '');
        } else if(platform === 'ios') {
            versionStr = agent.match(/OS\s+([\d\_]+)/i)[0];
            versionStr = versionStr.replace(/_/g, '.');
            versionStr = versionStr.replace(/OS\s/, '');
        }

        if(versionStr.length) {
            versionStr = versionStr.replace(/\./g, '');

            while(versionStr.length < 3) {
                versionStr += '0';
            }

            versionNum = parseInt(versionStr, 10);
        }

        this.osVersion = versionNum;

        if(this.platform === 'android' && this.osVersion < 440) {
            this.playVideoTag = true;
        }

        this.options = {
            framesPerSecond: 25,
            hideVideo: true,
            autoplay: false,
            audio: false,
            timelineSelector: false,
            timelineBar: false,
            resetOnLastFrame: true,
            loop: false,
            thumbnail: null
        };

        for (i in options) {
            this.options[i] = options[i];
        }

        window.video = this.video = typeof(this.options.videoSelector) === 'object' ? this.options.videoSelector : document.querySelector(this.options.videoSelector);
        this.canvas = typeof(this.options.canvasSelector) === 'object' ? this.options.canvasSelector : document.querySelector(this.options.canvasSelector);
        this.timeline = document.querySelector(this.options.timelineBar);
        this.timelinePassed = document.querySelector(this.options.timelineSelector);

        if (!this.options.videoSelector || !this.video) {
            console.error('No "videoSelector" property, or the element is not found');
            return;
        }

        if (!this.options.canvasSelector || !this.canvas) {
            console.error('No "canvasSelector" property, or the element is not found');
            return;
        }

        if (this.options.timelineSelector && !this.timeline) {
            console.error('Element for the "timelineSelector" selector not found');
            return;
        }

        if (this.options.timelineSelector && !this.timelinePassed) {
            console.error('Element for the "timelinePassed" not found');
            return;
        }

        if (this.options.audio) {
            if (typeof(this.options.audio) === 'string'){
                // Use audio selector from options if specified
                this.audio = document.querySelectorAll(this.options.audio)[0];

                if (!this.audio) {
                    console.error('Element for the "audio" not found');
                    return;
                }
            } else {
                // Creates audio element which uses same video sources
                this.audio = document.createElement('audio');
                this.audio.src = this.video.src;
                this.audio.innerHTML = this.video.innerHTML;
                this.video.parentNode.insertBefore(this.audio, this.video);

                this.audio.load();
            }

            if (this.platform === 'ios') {
                // Autoplay doesn't work with audio on iOS
                // User have to manually start the audio
                this.options.autoplay = false;
            }

        }

        this.width = this.canvas.parentNode.offsetWidth;
        this.height = this.canvas.parentNode.offsetHeight;

        // Canvas context
        this.ctx = this.canvas.getContext('2d');

        this.playing = false;

        this.resizeTimeoutReference = false;
        this.RESIZE_TIMEOUT = 500;

        this.init();
        this.bind();
    };

    CanvasVideo.prototype.init = function() {
        this.video.load();

        this.setCanvasSize();

        if (this.options.hideVideo) {
            this.video.style.display = 'none';
        }
    };

    CanvasVideo.prototype.isTouch = function() {
        try {
            document.createEvent("TouchEvent");
            return true;
        } catch(e) {
            return false;
        }
    };

    CanvasVideo.prototype.getOffset = function(elem) {
        var docElem, rect, doc;

        if (!elem) {
            return;
        }

        rect = elem.getBoundingClientRect();

        // Make sure element is not hidden (display: none) or disconnected
        if (rect.width || rect.height || elem.getClientRects().length) {
            doc = elem.ownerDocument;
            docElem = doc.documentElement;

            return {
                top: rect.top + window.pageYOffset - docElem.clientTop,
                left: rect.left + window.pageXOffset - docElem.clientLeft
            };
        }
    };

    CanvasVideo.prototype.jumpTo = function(percentage) {
        this.video.currentTime = this.video.duration * percentage;

        if (this.options.audio) {
            this.audio.currentTime = this.audio.duration * percentage;
        }
    };

    CanvasVideo.prototype.bind = function() {
        var self = this;

        // this.canvas.addEventListener('click', cvpHandlers.canvasClickHandler = function(e) {
        //     e.stopPropagation();
        //     e.preventDefault();
        //     self.playPause();
        // });

        this.video.addEventListener('timeupdate', cvpHandlers.videoTimeUpdateHandler = function() {
            // console.log('timeupdate');
            self.drawFrame();
            if (self.options.timelineSelector) {
                self.updateTimeline();
            }

            if(self.options.onUpdate) {
                self.options.onUpdate();
            }
        });

        this.video.addEventListener('waiting', cvpHandlers.waitingHandler = function() {
            // self.pause();
        });

        // this.video.addEventListener('canplaythrough', cvpHandlers.canplaythroughHandler = function() {
        //     // console.log('canplaythrough');
        // });

        this.video.addEventListener('ended', cvpHandlers.playEndHandler = function() {
            // console.log('ended');
            self.stopPlay();
        });

        this.video.addEventListener('canplay', cvpHandlers.videoCanPlayHandler = function() {
            // console.log('canplay');
            self.drawFrame();

            if(this.playinterval) {
                window.clearInterval(this.playinterval);
            }
        });

        this.video.addEventListener('loadeddata', cvpHandlers.videoLoadedHandler = function() {
            // console.log('loadeddata');
            if(self.options.onReady) {
                self.options.onReady();
            }

            self.setCanvasSize();

            if(self.playVideoTag) {
                self.drawFrame();
                if(this.playinterval) {
                    window.clearInterval(this.playinterval);
                }
            }
        });

        if(this.playVideoTag) {
            this.video.addEventListener('play', cvpHandlers.playHandler = function(e) {
                e.stopPropagation();
                e.preventDefault();

                if(self.options.onPlay) {
                    self.options.onPlay();
                }
            });

            this.video.addEventListener('pause', cvpHandlers.pauseHandler = function(e) {
                e.stopPropagation();
                e.preventDefault();

                if(self.playinterval) {
                    self.video.pause();
                    window.clearInterval(self.playinterval);
                }

                if(self.options.onPause) {
                    self.options.onPause();
                }
            });
        }

        // To be sure 'canplay' event that isn't already fired
        if (this.video.readyState >= 2) {
            self.drawFrame();
        }

        if (self.options.autoplay) {
            self.play();
        }

        var downevent = self.isTouch() ? 'touchdown' : 'mousedown';
        var moveevent = self.isTouch() ? 'touchmove' : 'mousemove';
        // Click on the video seek video
        if (self.options.timelineBar) {

            var isMousedown = false;
            this.timeline.addEventListener(downevent, cvpHandlers.timelineMousedownHandler = function(e) {
                e.preventDefault();
                isMousedown = true;
            });

            this.timeline.addEventListener('click', cvpHandlers.timelineClickHandler = function(e) {
                e.preventDefault();
                e.stopPropagation();
                isMousedown = false;
                var offset = e.clientX - self.getOffset(self.timeline).left;
                var percentage = offset / self.timeline.offsetWidth;
                self.jumpTo(percentage);
            });

            if(!self.isTouch()) {
                document.body.addEventListener('mouseup', cvpHandlers.timelineMouseupHandler = function(e) {
                    e.preventDefault();
                    isMousedown = false;
                });
            }

            this.timeline.addEventListener(moveevent, cvpHandlers.timelineMousemoveHandler = function(e) {
                e.preventDefault();

                if(isMousedown || self.isTouch()) {
                    if(!self.getOffset(self.timeline)) {
                        return;
                    }
                    var offset = (e.clientX || e.touches[0].clientX) - self.getOffset(self.timeline).left;
                    var percentage = offset / self.timeline.offsetWidth;
                    self.jumpTo(percentage);
                }
            });
        }

        // Cache canvas size on resize (doing it only once in a second)
        window.addEventListener('resize', cvpHandlers.windowResizeHandler = function() {
            clearTimeout(self.resizeTimeoutReference);

            self.resizeTimeoutReference = setTimeout(function() {
                self.setCanvasSize();
                self.drawFrame();
            }, self.RESIZE_TIMEOUT);
        });

        this.unbind = function() {
            // this.canvas.removeEventListener('click', cvpHandlers.canvasClickHandler);
            this.video.removeEventListener('timeupdate', cvpHandlers.videoTimeUpdateHandler);
            this.video.removeEventListener('canplay', cvpHandlers.videoCanPlayHandler);
            this.video.removeEventListener('loadeddata', cvpHandlers.videoLoadedHandler);
            this.video.removeEventListener('ended', cvpHandlers.playEndHandler);
            this.video.removeEventListener('waiting', cvpHandlers.waitingHandler);

            this.timeline.removeEventListener(downevent, cvpHandlers.timelineMousedownHandler);
            this.timeline.removeEventListener('click', cvpHandlers.timelineClickHandler);
            this.timeline.removeEventListener(moveevent, cvpHandlers.timelineMousemoveHandler);
            if(!self.isTouch()) {
                document.body.removeEventListener('mouseup', cvpHandlers.timelineMouseupHandler);
            }

            window.removeEventListener('resize', cvpHandlers.windowResizeHandler);
            if(this.playVideoTag) {
                this.video.removeEventListener('play', cvpHandlers.playHandler);
                this.video.removeEventListener('pause', cvpHandlers.pauseHandler);
            }

            if (this.options.audio) {
                this.audio.parentNode.removeChild(this.audio);
            }
        };
    };

    CanvasVideo.prototype.updateTimeline = function() {
        var percentage = (this.video.currentTime * 100 / this.video.duration).toFixed(2);

        this.timelinePassed.style.width = percentage + '%';
    };

    var img = null;
    CanvasVideo.prototype.setCanvasSize = function() {
        var self = this;
        var setSize = function(w, h) {
            if(!w || !h) {
                return;
            }

            var ratio = window.innerWidth / w;

            var style = window.getComputedStyle(self.canvas.parentNode);
            var maxWidth = parseInt(style.maxWidth, 10);
            var maxHeight = parseInt(style.maxHeight, 10);

            if(maxWidth && (window.innerWidth > maxWidth)) {
                ratio = maxWidth / w;
            }

            self.width = w * ratio;
            self.height = h * ratio;
            if(h > w && maxHeight) {
                var heightRatio = (window.innerWidth / maxWidth) * maxHeight;
                if(heightRatio > maxHeight) {
                    heightRatio = maxHeight;
                }

                if(self.height > heightRatio) {
                    ratio = heightRatio / self.height;
                    self.width = self.width * ratio;
                    self.height = self.height * ratio;
                }
            }

            self.canvas.setAttribute('width', self.width);
            self.canvas.setAttribute('height', self.height);

            self.canvas.parentNode.style.backgroundSize = self.width + 'px ' + self.height + 'px';
            self.canvas.parentNode.style.backgroundColor = '#000000';

            if(self.playVideoTag) {
                self.canvas.style.height = self.height + 'px';
                self.canvas.style.width = self.width + 'px';

                self.video.style.height = self.height + 'px';
                self.video.style.width = self.width + 'px';
                self.video.setAttribute('width', self.width);
                self.video.setAttribute('height', self.height);
            }

            if(self.options.thumbnail) {
                self.ctx.drawImage(img, 0, 0, self.width, self.height);
                self.video.setAttribute('poster', self.options.thumbnail);
            }
        };

        if(this.options.thumbnail) {
            if(!img) {
                img = new Image();
                img.onload = function() {
                    var imgW = this.width;
                    var imgH = this.height;
                    setSize(imgW, imgH);
                };

                img.src = this.options.thumbnail;
            } else {
                setSize(img.width, img.height);
            }
        } else {
            setSize(this.video.videoWidth, this.video.videoHeight);
        }
    };

    CanvasVideo.prototype.play = function() {
        this.lastTime = Date.now();
        this.playing = true;
        this.loop();

        if(this.options.onPlay && !this.playVideoTag) {
            this.options.onPlay();
        }

        if (this.options.audio && !this.playVideoTag) {
            // Resync audio and video
            this.audio.currentTime = this.video.currentTime;
            this.audio.play();
        }

        if(this.playVideoTag) {
            this.video.style.display = 'block';
            this.canvas.style.display = 'none';
        }
    };

    CanvasVideo.prototype.pause = function() {
        this.playing = false;

        if(this.playinterval) {
            this.video.pause();
            window.clearInterval(this.playinterval);
        }

        if(this.options.onPause && !this.playVideoTag) {
            this.options.onPause();
        }

        if (this.options.audio && !this.playVideoTag) {
            this.audio.pause();
        }

        if(this.playVideoTag) {
            this.video.style.display = 'none';
            this.canvas.style.display = 'block';
        }
    };

    CanvasVideo.prototype.stopPlay = function() {
        this.video.currentTime = 0;

        this.playing = false;

        if(this.playinterval) {
            this.video.pause();
            window.clearInterval(this.playinterval);
        }

        if(this.options.onPlayEnd) {
            this.options.onPlayEnd();
        }

        if (this.options.audio) {
            this.audio.pause();
        }
    };

    CanvasVideo.prototype.playPause = function() {
        if (this.playing) {
            this.pause();
        } else {
            this.play();
        }
    };

    CanvasVideo.prototype.loop = function() {
        var self = this;

        var time = Date.now();
        var elapsed = (time - this.lastTime) / 1000;

        // Render
        if(elapsed >= (1 / this.options.framesPerSecond)) {
            this.video.currentTime = this.video.currentTime + elapsed;
            this.lastTime = time;
            // Resync audio and video if they drift more than 300ms apart
            if(this.audio && Math.abs(this.audio.currentTime - this.video.currentTime) > 0.3){
                this.audio.currentTime = this.video.currentTime;
            }
        }

        // If we are at the end of the video stop
        if (this.video.currentTime >= this.video.duration) {
            this.playing = false;


            if (this.options.resetOnLastFrame === true) {
                this.video.currentTime = 0;
            }

            if (this.options.loop === true) {
                this.video.currentTime = 0;
                this.play();
            }

            if(this.options.onPlayEnd) {
                this.options.onPlayEnd();
            }
        }

        if (this.playing) {
            if(this.platform === 'ios') {
                this.animationFrame = requestAnimationFrame(function(){
                    self.loop();
                });
            } else {
                this.playinterval = window.setInterval(function() {
                    self.drawFrame();
                });

                window.setTimeout(function() {
                    self.video.play();
                }, 100);
            }
        } else {
            cancelAnimationFrame(this.animationFrame);
            if(this.playinterval) {
                window.clearInterval(this.playinterval);
            }
        }
    };

    CanvasVideo.prototype.drawFrame = function() {
        this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
    };

    return CanvasVideo;
})();
