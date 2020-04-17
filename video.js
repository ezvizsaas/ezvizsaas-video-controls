import React, { PropTypes } from "react";
import { Link, withRouter } from "react-router-dom";
import qs from "qs";
import { Toast, Modal } from "antd-mobile";
import moment from "moment";
import "./video.less";

class H5Video extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isStart: false, // 判断是否已经开始取流播放
      isPlay: false, // 判断是否在开始播放状态
      isLoad: false, // 判断是否在load状态
      isShowControls: false // 播放器下面的操作项按钮
    };
  }

  // 30s判断一次是否处于时间计划以内
  registerTimer = _times => {
    this.batchCaculateWithinRange(_times);
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    this.batchTimer = setInterval(() => {
      this.batchCaculateWithinRange(_times);
    }, 30000);
  };
  // 批量判断是否不在所有的时间计划内
  batchCaculateWithinRange = _times => {
    try {
      const times = JSON.parse(_times);
      if (!times.length) {
        return;
      }
      for (let i = 0; i < times.length; i++) {
        if (
          this.caculateIsWithinRange(
            times[i].begin_time,
            moment()
              .locale("zh-cn")
              .format("HH:mm"),
            times[i].end_time
          )
        ) {
          return;
        }
      }
      this.shouldLeaveLook();
    } catch (e) {}
  };

  // 判断是否在时间计划内
  caculateIsWithinRange = (beginTime, nowTime, endTime) => {
    if (!endTime) {
      return true;
    }
    const beginTimeTotal = this.caculateTotalTimer(beginTime.split(":"));
    const nowDateTotal = this.caculateTotalTimer(nowTime.split(":"));
    const endTimeTotal = this.caculateTotalTimer(endTime.split(":"));
    if (beginTimeTotal <= nowDateTotal && endTimeTotal > nowDateTotal) {
      return true;
    }
    return false;
  };

  caculateTotalTimer = timesArr => {
    if (timesArr.length !== 2) {
      return 0;
    }
    return Number(timesArr[0]) * 60 + Number(timesArr[1]);
  };
  // 离开直播页面
  shouldLeaveLook = () => {
    const { history } = this.props;
    this.exitFullscreen();
    this.videoEle.pause();
    Toast.info("直播已关闭", 3, async () => {
      history.go(-1);
    });
  };

  componentDidMount() {
    const { rowData } = this.props;
    // 加上时间计划在内
    if (
      rowData.plan &&
      rowData.plan.plan_details &&
      rowData.plan.plan_details.times
    ) {
      this.registerTimer(rowData.plan.plan_details.times);
    }
    if (!this.videoEle) {
      return;
    }
    const videoPromise = this.videoEle.play();
    this.startWebSockt();
    if (videoPromise !== undefined) {
      this.setState({
        isLoad: true
      });
      videoPromise.catch(() => {
        this.setState({
          isStart: false,
          isPlay: false,
          isLoad: false,
          isShowControls: false
        });
      });
      // 首次如果3s没播放出来，就重连一次
      this.intervalFetchHls(rowData.plan.hls, 3000);
      return;
    }

    this.setState({
      isStart: false,
      isPlay: false,
      isLoad: false,
      isShowControls: false
    });
  }
  componentWillUnmount() {
    clearTimeout(this.firstFrameIns); // 去除重连有的定时器

    clearInterval(this.batchTimer); // 去除30s判断是否在时间计划内的
    this.batchTimer = null;
  }
  // 开始取流播放的回调函数
  onTimeUpdate = () => {
    if (this.videoEle.currentTime > 0.1 && !this.state.isPlay) {
      clearTimeout(this.firstFrameIns);
      // this.addListenPlayedTimer = null;
      this.setState({
        isLoad: false,
        isPlay: true,
        isStart: true
      });
    }
  };
  // 点了播放按钮后，onplay会先触发回调
  onPlay = () => {
    this.setState({
      isStart: true,
      isLoad: true
    });
  };
  // 暂停播放
  onPause = () => {
    this.setState({
      isStart: false,
      isPlay: false,
      isLoad: false,
      isShowControls: false
    });
    // this.exitFullscreen();
  };
  // 结束播放的回调
  onEnded = () => {
    this.setState({
      isStart: false,
      isPlay: false,
      isLoad: false,
      isShowControls: false
    });
  };
  togglePauseVideo = async () => {
    const { isStart } = this.state;
    const { rowData } = this.props;
    if (isStart) {
      this.videoEle.pause();
      // 主动暂停播放时，停止重连设置
      clearTimeout(this.firstFrameIns);
    } else {
      if (rowData && rowData.plan && rowData.plan && rowData.plan.hls) {
        this.setState({
          isLoad: true
        });
        if (rowData.plan.hls.includes("?")) {
          this.videoEle.src = `${rowData.plan.hls}&q=${Date.now()}`;
        } else {
          this.videoEle.src = `${rowData.plan.hls}?q=${Date.now()}`;
        }
        this.videoEle.play();
        this.intervalFetchHls(rowData.plan.hls);
      }
    }
  };
  // 加上重连机制，如果6s没有触发onTimeUpdate的话就重新连接
  intervalFetchHls = hls => {
    if (this.firstFrameIns) {
      clearTimeout(this.firstFrameIns);
    }

    this.firstFrameIns = setTimeout(() => {
      if (!this.state.isPlay) {
        this.videoEle.pause();
        if (hls.includes("?")) {
          this.videoEle.src = `${hls}&q=${Date.now()}`;
        } else {
          this.videoEle.src = `${hls}?q=${Date.now()}`;
        }
        this.videoEle.play();
        this.intervalFetchHls(hls);
      } else {
        if (this.firstFrameIns) {
          clearTimeout(this.firstFrameIns);
        }
      }
    }, 6000);
  };
  // 进入全屏
  enterFullscreen = () => {
    let _requestFullscreen =
      this.videoEle.requestFullscreen ||
      this.videoEle.webkitEnterFullScreen ||
      this.videoEle.webkitRequestFullscreen;
    _requestFullscreen.apply(this.videoEle);
  };
  // 退出全屏
  exitFullscreen = () => {
    let _exitFullscreen =
      this.videoEle.exitFullscreen ||
      this.videoEle.webkitExitFullscreen ||
      this.videoEle.mozCancelFullScreen ||
      this.videoEle.msExitFullscreen;
    _exitFullscreen.apply(this.videoEle);
  };
  // 切换展示播放器下的操作项按钮
  showControls = () => {
    if (this.state.isShowControls) {
      this.setState({
        isShowControls: false
      });
    } else if (this.state.isLoad || this.state.isStart) {
      this.setState({
        isShowControls: true
      });
    }
  };
  render() {
    const { isLoad, isStart, isPlay, isShowControls } = this.state;
    const { rowData } = this.props;
    if (rowData && rowData.plan && rowData.plan && rowData.plan.hls) {
      m3u8Src = rowData.plan.hls || "";
    }
    return (
      <div className="video-wrapper">
        <video
          className="live-video"
          x-webkit-airplay="true"
          webkit-playsinline="true"
          playsInline
          poster={rowData.picUrl}
          x5-video-player-type="h5"
          onTimeUpdate={this.onTimeUpdate}
          ref={video => (this.videoEle = video)}
          onPause={this.onPause}
          onPlay={this.onPlay}
          onClick={this.showControls}
          onEnded={this.onEnded}
          src={m3u8Src}
        ></video>
        {/* 伪造播放器poster封面，加上点击封面切换显示播放器下的操作按钮选项 */}
        {!isPlay ? (
          <div
            style={{
              background: `url(${rowData.picUrl}) center center/cover no-repeat`
            }}
            className="controls-play-poster"
            onClick={this.showControls}
          ></div>
        ) : null}
        {/* 
            封面上的播放按钮的状态
          */}
        {!isLoad && !isStart ? (
          <img
            src={require("../../assets/imgs/icn_play_live@2x.png")}
            className="controls-play-btn"
            onClick={this.togglePauseVideo}
          />
        ) : null}
        {/* 
            视频流加载中的状态
          */}
        {isLoad && !isPlay ? (
          <div className="controls-load">
            <img
              src={require("../../assets/imgs/video/video-load.png")}
              className="controls-load--img"
            />
            <span className="controls-load--span">
              拼命加载中
              <div className="load-dot">
                <span className="load-dot__keyframes">...</span>
              </div>
            </span>
          </div>
        ) : null}
        {/* 
          播放器下面一排的操作项，开始，暂停，全屏等
        */}
        {isShowControls ? (
          <div className="controls">
            <div className="controls-left">
              <img
                src={
                  isStart
                    ? require("../../assets/imgs/video/video-pause.png")
                    : require("../../assets/imgs/video/video-play.png")
                }
                onClick={this.togglePauseVideo}
              />
            </div>
            <div className="controls-right" id="">
              <img
                src={require("../../assets/imgs/video/video-fullscreen.png")}
                onClick={this.enterFullscreen}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}

export default withRouter(H5Video);
